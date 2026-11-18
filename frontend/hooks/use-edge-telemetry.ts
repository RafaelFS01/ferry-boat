'use client';

import { useEffect, useState } from 'react';
import {
  fetchBufferStatus,
  fetchLatestTelemetry,
  type BufferStatus,
  type TelemetryPacket,
} from '@/lib/edge-api';

export interface EdgeTelemetry {
  packet: TelemetryPacket | null;
  buffer: BufferStatus | null;
  apiReachable: boolean;
  /** Primeira consulta ainda não respondeu */
  loading: boolean;
  lastPollAt: number | null;
}

const INITIAL: EdgeTelemetry = { packet: null, buffer: null, apiReachable: true, loading: true, lastPollAt: null };

/**
 * Consulta a API local do barco em intervalo fixo. Mantém a última telemetria
 * válida na tela quando o nó embarcado para de responder.
 */
export function useEdgeTelemetry(intervalMs = 2000): EdgeTelemetry {
  const [state, setState] = useState<EdgeTelemetry>(INITIAL);

  useEffect(() => {
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const poll = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), intervalMs);
      const [latest, buffer] = await Promise.all([
        fetchLatestTelemetry(controller.signal),
        fetchBufferStatus(controller.signal),
      ]);
      clearTimeout(timeout);
      if (stopped) return;

      setState((previous) => ({
        packet: latest.ok ? latest.data ?? previous.packet : previous.packet,
        buffer: buffer.ok ? buffer.data : previous.buffer,
        apiReachable: latest.ok || buffer.ok,
        loading: false,
        lastPollAt: Date.now(),
      }));
      timer = setTimeout(poll, intervalMs);
    };

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [intervalMs]);

  return state;
}
