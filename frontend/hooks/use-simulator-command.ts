'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSimulatorCommand, sendSimulatorCommand, type SimulatorCommand } from '@/lib/edge-api';

export interface SimulatorCommandState {
  /** Comando exibido: o último confirmado pelo barco, ou o que o operador está ajustando */
  command: SimulatorCommand | null;
  /** O último envio falhou; a tela volta ao valor confirmado */
  failed: boolean;
  update: (change: Partial<SimulatorCommand>) => void;
}

const SEND_DELAY_MS = 250;

/**
 * Lê o comando atual do simulador e envia os ajustes do operador. Mudanças
 * seguidas (arrastar o controle) viram um único PUT depois de uma pausa curta.
 */
export function useSimulatorCommand(): SimulatorCommandState {
  const [command, setCommand] = useState<SimulatorCommand | null>(null);
  const [failed, setFailed] = useState(false);
  const confirmed = useRef<SimulatorCommand | null>(null);
  const pending = useRef<Partial<SimulatorCommand>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSimulatorCommand(controller.signal).then((result) => {
      if (!result.ok || !result.data) return;
      confirmed.current = result.data;
      setCommand((current) => current ?? result.data);
    });
    return () => {
      controller.abort();
      clearTimeout(timer.current);
    };
  }, []);

  const flush = useCallback(async () => {
    const change = pending.current;
    pending.current = {};
    const result = await sendSimulatorCommand(change);
    setFailed(result === null);
    if (result) confirmed.current = result;
    // Sem novos ajustes no caminho, a tela mostra o que o barco confirmou
    if (Object.keys(pending.current).length === 0) setCommand(result ?? confirmed.current);
  }, []);

  const update = useCallback((change: Partial<SimulatorCommand>) => {
    pending.current = { ...pending.current, ...change };
    setCommand((current) => (current ? { ...current, ...change } : current));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SEND_DELAY_MS);
  }, [flush]);

  return { command, failed, update };
}
