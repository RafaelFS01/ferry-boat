import type { Zone } from '@/lib/instruments';

export const ZONE_TEXT: Record<Zone, string> = {
  normal: 'text-ink',
  warn: 'text-warn',
  danger: 'text-danger',
};

export const ZONE_BG: Record<Zone, string> = {
  normal: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

export type Tone = 'ok' | 'warn' | 'danger' | 'muted';

export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-muted',
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  muted: 'text-muted',
};
