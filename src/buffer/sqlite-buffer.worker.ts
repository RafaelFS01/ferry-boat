import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parentPort, workerData } from 'node:worker_threads';
import type { TelemetryPacket } from '../grpc/telemetry';
import type { BufferCommand, BufferReply, BufferRow } from './buffer.types';

const port = parentPort;
if (!port) throw new Error('O armazenamento SQLite deve executar em worker.');
const { path } = workerData as { path: string };
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec(`
  PRAGMA busy_timeout=1000;
  PRAGMA locking_mode=EXCLUSIVE;
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=FULL;
  PRAGMA cache_size=-2048;
`);
if (Number(db.prepare('PRAGMA user_version').get()?.user_version) > 1) {
  throw new Error('Versão do buffer SQLite não suportada.');
}
db.exec(`
  CREATE TABLE IF NOT EXISTS pending (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  PRAGMA user_version=1;
`);
if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') {
  throw new Error('Falha na verificação de integridade do buffer SQLite.');
}
let count = Number(db.prepare('SELECT count(*) AS count FROM pending').get()?.count);
const savedLatest = db.prepare("SELECT value FROM metadata WHERE key='latest'").get();
let latest: TelemetryPacket | null = savedLatest ? JSON.parse(String(savedLatest.value)) as TelemetryPacket : null;
const insert = db.prepare('INSERT OR IGNORE INTO pending(message_id, payload) VALUES (?, ?)');
const read = db.prepare('SELECT ordinal, payload FROM pending WHERE ordinal > ? ORDER BY ordinal LIMIT ?');
const remove = db.prepare('DELETE FROM pending WHERE message_id=?');
const saveLatest = db.prepare("INSERT INTO metadata(key,value) VALUES ('latest',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");

function rows(after: number, limit: number): BufferRow[] {
  return read.all(after, limit).map((row) => ({
    ordinal: Number(row.ordinal), packet: JSON.parse(String(row.payload)) as TelemetryPacket,
  }));
}

port.on('message', (command: BufferCommand) => {
  const reply: BufferReply = { id: command.id };
  try {
    switch (command.op) {
      case 'load':
        reply.value = { count, rows: rows(0, command.limit!), latest };
        break;
      case 'read':
        reply.value = rows(command.after!, command.limit!);
        break;
      case 'append': {
        const packet = command.packet!;
        const payload = JSON.stringify(packet);
        db.exec('BEGIN IMMEDIATE');
        let inserted = false;
        let ordinal = 0;
        try {
          const result = insert.run(packet.message_id, payload);
          inserted = Number(result.changes) === 1;
          ordinal = Number(result.lastInsertRowid);
          if (inserted && (command.rememberLatest || latest === null)) saveLatest.run(payload);
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        if (inserted) {
          count++;
          if (command.rememberLatest || latest === null) latest = packet;
        }
        reply.value = { inserted, count, row: inserted ? { ordinal, packet } : null, latest };
        break;
      }
      case 'remove':
        count -= Number(remove.run(command.messageId!).changes);
        reply.value = count;
        break;
      case 'close':
        db.close();
        reply.value = null;
        break;
    }
  } catch (error) {
    reply.error = error instanceof Error ? error.message : 'Falha no armazenamento SQLite.';
  }
  port.postMessage(reply);
  if (command.op === 'close') port.close();
});
