const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

test('executa o build isolado com o IDL empacotado e configuração do .env', { timeout: 15000 }, async (t) => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'ferry-boat-'));
  assert.equal(path.dirname(path.resolve(temporaryRoot)), path.resolve(tmpdir()));
  assert.ok(path.basename(temporaryRoot).startsWith('ferry-boat-'));
  const project = path.join(temporaryRoot, 'boat');
  mkdirSync(project);
  cpSync(path.resolve(__dirname, '../dist'), path.join(project, 'dist'), { recursive: true });
  let child;
  let finished;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    if (finished) await finished;
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  writeFileSync(path.join(project, '.env'), [
    'NODE_ENV=test',
    'SIMULATOR_ENABLED=false',
    'API_HOST=127.0.0.1',
    `API_PORT=${port}`,
    'BOAT_ID=ferry-build-isolado',
    'CENTRAL_GRPC_URL=127.0.0.1:1',
  ].join('\n'));

  const environment = { ...process.env };
  for (const name of [
    'NODE_ENV', 'API_HOST', 'API_PORT', 'BOAT_ID', 'CENTRAL_GRPC_URL', 'SIMULATOR_ENABLED',
    'TELEMETRY_PROTO_PATH', 'GRPC_TLS_CA_PATH', 'GRPC_TLS_CERT_PATH', 'GRPC_TLS_KEY_PATH',
  ]) delete environment[name];
  environment.NODE_PATH = path.resolve(__dirname, '../node_modules');
  child = spawn(process.execPath, ['dist/main.js'], {
    cwd: project,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  finished = once(child, 'exit');

  const endpoint = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + 10000;
  let response;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) assert.fail(`Bootstrap encerrou: ${output}`);
    try {
      response = await fetch(endpoint, { signal: AbortSignal.timeout(500) });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(response, `API não iniciou: ${output}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', boat_id: 'ferry-build-isolado' });
});
