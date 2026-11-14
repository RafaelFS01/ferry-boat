import type { BufferStatus } from '@/lib/edge-api';
import { formatAge, formatNumber } from '@/lib/format';
import { Panel } from './panel';

interface BufferCardProps {
  buffer: BufferStatus | null;
  now: number;
}

/** Pacotes retidos a bordo durante a partição de rede, separados entre memória e disco. */
export function BufferCard({ buffer, now }: BufferCardProps) {
  if (!buffer) {
    return (
      <Panel title="Pacotes retidos">
        <p className="text-base text-muted">Buffer do nó embarcado indisponível.</p>
      </Panel>
    );
  }

  const memoryShare = buffer.memory_limit > 0 ? Math.min(100, (buffer.memory_count / buffer.memory_limit) * 100) : 0;
  const oldest = buffer.oldest_timestamp ? Number(buffer.oldest_timestamp) : null;
  const tone = buffer.pending_count === 0 ? 'text-ok' : buffer.disk_count > 0 ? 'text-danger' : 'text-warn';

  return (
    <Panel title="Pacotes retidos">
      <div className="flex items-baseline gap-2">
        <span className={`font-display text-6xl font-semibold leading-none ${tone}`}>{formatNumber(buffer.pending_count)}</span>
        <span className="text-base text-muted">aguardando envio</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-sm text-muted">Em memória</p>
          <p className="font-display text-2xl font-semibold">{formatNumber(buffer.memory_count)}</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-sm text-muted">Em disco</p>
          <p className="font-display text-2xl font-semibold">{formatNumber(buffer.disk_count)}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-sm text-muted">
          <span>Ocupação da memória</span>
          <span>{formatNumber(buffer.memory_count)} / {formatNumber(buffer.memory_limit)}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${memoryShare}%` }} />
        </div>
      </div>

      {oldest && buffer.pending_count > 0 && (
        <p className="mt-3 text-sm text-muted">Pacote mais antigo coletado {formatAge(oldest, now)}</p>
      )}
    </Panel>
  );
}
