import type { BufferStatus } from '@/lib/edge-api';
import { formatAge, formatClock, formatNumber } from '@/lib/format';
import type { Zone } from '@/lib/instruments';
import { LINK_STATUS_VIEW, type LinkStatus } from '@/lib/link-status';
import { BarMeter } from './instrument/bar-meter';
import { Module } from './module';
import { TONE_DOT, TONE_TEXT } from './tone';

interface LinkModuleProps {
  status: LinkStatus;
  buffer: BufferStatus | null;
  now: number;
}

function Reading({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`font-mono text-sm font-medium ${tone}`}>{value}</dd>
    </div>
  );
}

/** Enlace gRPC com a Central e os pacotes retidos a bordo durante a partição de rede. */
export function LinkModule({ status, buffer, now }: LinkModuleProps) {
  const view = LINK_STATUS_VIEW[status];
  const lastAck = buffer?.last_ack_at ? Number(buffer.last_ack_at) : null;
  const nextRetry = buffer?.next_retry_at ? Number(buffer.next_retry_at) : null;
  const oldest = buffer?.oldest_timestamp ? Number(buffer.oldest_timestamp) : null;
  const limit = buffer?.memory_limit ?? 0;
  const memoryZone = (count: number): Zone => (limit && count / limit > 0.8 ? 'danger' : limit && count / limit > 0.5 ? 'warn' : 'normal');

  return (
    <Module label="Enlace com a Central" className="h-full">
      <div className="flex items-start gap-4" aria-live="polite">
        <span className="relative mt-2 flex size-4 shrink-0">
          {view.tone !== 'ok' && view.tone !== 'muted' && (
            <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${TONE_DOT[view.tone]}`} />
          )}
          <span className={`relative inline-flex size-4 rounded-full ${TONE_DOT[view.tone]}`} />
        </span>
        <div className="min-w-0">
          <p className={`text-3xl font-medium tracking-[-0.02em] ${TONE_TEXT[view.tone]}`}>{view.label}</p>
          <p className="mt-1 text-sm text-muted">{buffer?.last_error?.message ?? view.detail}</p>
        </div>
      </div>

      <dl className="mt-4">
        <Reading label="Último ACK" value={lastAck ? `${formatClock(lastAck)} · ${formatAge(lastAck, now)}` : '—'} />
        {nextRetry !== null && nextRetry > now && <Reading label="Nova tentativa" value={`em ${Math.ceil((nextRetry - now) / 1000)} s`} tone="text-warn" />}
        <Reading
          label="Retidos a bordo"
          value={buffer ? `${formatNumber(buffer.pending_count)} pacotes` : '—'}
          tone={!buffer || buffer.pending_count === 0 ? 'text-ink' : buffer.disk_count > 0 ? 'text-danger' : 'text-warn'}
        />
        {buffer && buffer.disk_count > 0 && <Reading label="Em disco" value={formatNumber(buffer.disk_count)} tone="text-danger" />}
        {oldest && buffer && buffer.pending_count > 0 && <Reading label="Mais antigo" value={formatAge(oldest, now)} />}
      </dl>

      {buffer && limit > 0 && (
        <div className="mt-auto pt-4">
          <BarMeter
            label="Buffer em memória"
            value={buffer.memory_count}
            min={0}
            max={limit}
            unit="pacotes"
            zoneAt={memoryZone}
            segments={20}
          />
        </div>
      )}
    </Module>
  );
}
