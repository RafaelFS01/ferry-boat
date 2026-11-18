// Traduz o estado do buffer FIFO no estado do enlace gRPC mostrado ao capitão.
// Sem imports: roda direto no `node --test` com type stripping.

export type LinkStatus =
  | 'conectado'
  | 'sincronizando'
  | 'desconectado'
  | 'bloqueado'
  | 'falha-armazenamento'
  | 'sem-api'
  | 'desconhecido'
  | 'conectando';

export interface LinkInput {
  /** Primeira consulta à API local ainda em andamento */
  loading?: boolean;
  /** A API local do NestJS respondeu à última consulta */
  apiReachable: boolean;
  buffer: {
    state: 'disabled' | 'idle' | 'draining' | 'offline' | 'blocked' | 'storage_error';
    pending_count: number;
    last_error: { kind: string } | null;
  } | null;
}

export function deriveLinkStatus({ loading = false, apiReachable, buffer }: LinkInput): LinkStatus {
  if (loading) return 'conectando';
  if (!apiReachable) return 'sem-api';
  if (!buffer) return 'desconhecido';

  switch (buffer.state) {
    case 'offline':
      return 'desconectado';
    case 'blocked':
      return 'bloqueado';
    case 'storage_error':
      return 'falha-armazenamento';
    case 'draining':
      return 'sincronizando';
    case 'idle':
      return buffer.pending_count > 0 ? 'sincronizando' : 'conectado';
    case 'disabled':
      // Sem buffer, o único sinal do enlace é o último erro gRPC registrado
      return buffer.last_error?.kind === 'grpc' ? 'desconectado' : 'conectado';
  }
}

export interface LinkStatusView {
  label: string;
  detail: string;
  tone: 'ok' | 'warn' | 'danger' | 'muted';
}

export const LINK_STATUS_VIEW: Record<LinkStatus, LinkStatusView> = {
  conectado: { label: 'Conectado', detail: 'Enlace gRPC com a Central ativo', tone: 'ok' },
  sincronizando: { label: 'Sincronizando buffer', detail: 'Reenviando pacotes retidos para a Central', tone: 'warn' },
  desconectado: { label: 'Desconectado', detail: 'Central inacessível — pacotes retidos a bordo', tone: 'danger' },
  bloqueado: { label: 'Envio bloqueado', detail: 'A Central rejeitou um pacote; verificar com a terra', tone: 'danger' },
  'falha-armazenamento': { label: 'Falha no buffer', detail: 'Erro ao gravar o buffer em disco', tone: 'danger' },
  'sem-api': { label: 'Sem comunicação local', detail: 'O nó embarcado não está respondendo', tone: 'muted' },
  desconhecido: { label: 'Estado desconhecido', detail: 'Buffer do nó embarcado ainda não disponível', tone: 'muted' },
  conectando: { label: 'Conectando…', detail: 'Consultando o nó embarcado', tone: 'muted' },
};
