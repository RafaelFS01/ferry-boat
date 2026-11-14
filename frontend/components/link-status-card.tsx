import type { BufferStatus } from '@/lib/edge-api';
import { formatAge, formatClock } from '@/lib/format';
import { LINK_STATUS_VIEW, type LinkStatus } from '@/lib/link-status';
import { TONE_DOT, TONE_TEXT } from './tone';

interface LinkStatusCardProps {
  status: LinkStatus;
  buffer: BufferStatus | null;
  now: number;
}

const RING: Record<string, string> = {
  ok: 'border-ok/50',
  warn: 'border-warn/60',
  danger: 'border-danger/70',
  muted: 'border-line',
};

/** Estado do enlace gRPC com a Central, em destaque no topo do painel. */
export function LinkStatusCard({ status, buffer, now }: LinkStatusCardProps) {
  const view = LINK_STATUS_VIEW[status];
  const lastAck = buffer?.last_ack_at ? Number(buffer.last_ack_at) : null;
  const nextRetry = buffer?.next_retry_at ? Number(buffer.next_retry_at) : null;

  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border-2 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between ${RING[view.tone]}`}
      aria-live="polite"
    >
      <div className="flex items-center gap-4">
        <span className="relative flex size-5 shrink-0">
          {view.tone !== 'ok' && view.tone !== 'muted' && (
            <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${TONE_DOT[view.tone]}`} />
          )}
          <span className={`relative inline-flex size-5 rounded-full ${TONE_DOT[view.tone]}`} />
        </span>
        <div>
          <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-muted">Enlace com a Central</p>
          <p className={`font-display text-3xl font-semibold leading-tight ${TONE_TEXT[view.tone]}`}>{view.label}</p>
          <p className="text-base text-muted">{buffer?.last_error?.message ?? view.detail}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
        <dt className="text-muted">Último ACK</dt>
        <dd className="font-semibold">{lastAck ? `${formatClock(lastAck)} · ${formatAge(lastAck, now)}` : '—'}</dd>
        {nextRetry && nextRetry > now && (
          <>
            <dt className="text-muted">Nova tentativa</dt>
            <dd className="font-semibold">em {Math.ceil((nextRetry - now) / 1000)} s</dd>
          </>
        )}
      </dl>
    </section>
  );
}
