import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLinkStatus, type LinkInput } from './link-status.ts';

const buffer = (state: NonNullable<LinkInput['buffer']>['state'], pending = 0, lastError: { kind: string } | null = null) =>
  ({ apiReachable: true, buffer: { state, pending_count: pending, last_error: lastError } });

test('primeira consulta em andamento mostra conectando', () => {
  assert.equal(deriveLinkStatus({ loading: true, apiReachable: true, buffer: null }), 'conectando');
});

test('sem resposta da API local tem prioridade sobre o buffer', () => {
  assert.equal(deriveLinkStatus({ apiReachable: false, buffer: buffer('idle').buffer }), 'sem-api');
});

test('endpoint de buffer ausente resulta em estado desconhecido', () => {
  assert.equal(deriveLinkStatus({ apiReachable: true, buffer: null }), 'desconhecido');
});

test('idle sem pendências é conectado; com pendências é sincronizando', () => {
  assert.equal(deriveLinkStatus(buffer('idle')), 'conectado');
  assert.equal(deriveLinkStatus(buffer('idle', 12)), 'sincronizando');
});

test('estados de falha do buffer mapeiam para alertas distintos', () => {
  assert.equal(deriveLinkStatus(buffer('offline', 40)), 'desconectado');
  assert.equal(deriveLinkStatus(buffer('draining', 40)), 'sincronizando');
  assert.equal(deriveLinkStatus(buffer('blocked', 1)), 'bloqueado');
  assert.equal(deriveLinkStatus(buffer('storage_error')), 'falha-armazenamento');
});

test('buffer desabilitado usa o último erro gRPC como sinal do enlace', () => {
  assert.equal(deriveLinkStatus(buffer('disabled')), 'conectado');
  assert.equal(deriveLinkStatus(buffer('disabled', 0, { kind: 'grpc' })), 'desconectado');
});
