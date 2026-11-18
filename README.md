# Nó embarcado — ferry-boat

Base do cliente da telemetria Salvador–Itaparica, conforme o README do
[orquestrador](https://github.com/RafaelFS01/ferry-telemetry-tde).

## Requisitos e execução local

- Node.js 24 LTS, a partir de 24.15, e npm 11 (`.nvmrc` e `engines`).
- Contrato canônico `proto/telemetry.proto` do orquestrador. Não existe uma cópia
  independente do IDL versionada neste repositório.

Na raiz de `ferry-telemetry-tde`:

```powershell
git submodule update --init ferry-boat
cd ferry-boat
Copy-Item .env.example .env
npm ci
npm run start:dev
```

Em Linux/macOS, use `cp .env.example .env` no lugar de `Copy-Item`.
Se clonou apenas `ferry-boat`, disponibilize o IDL do orquestrador e configure
`TELEMETRY_PROTO_PATH` no `.env` antes de gerar tipos ou iniciar a aplicação.

A API inicia em `http://localhost:3002`; `GET /health` retorna:

```json
{"status":"ok","boat_id":"ferry-ivete-sangalo"}
```

Esse endpoint verifica o processo de bordo. A Central não precisa estar disponível
para iniciar o barco; a conexão gRPC é usada quando uma RPC é invocada.

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm run proto:generate` | Gera `src/grpc/telemetry.ts` com `grpc-tools` e `ts-proto`. |
| `npm run build` | Regenera tipos, compila e inclui o IDL em `dist/proto/telemetry.proto`. |
| `npm run start:dev` | Regenera tipos e inicia o Nest com recompilação automática. |
| `npm start` | Regenera tipos, compila e inicia o Nest. |
| `npm run start:prod` | Executa `dist/main.js` após o build. |
| `npm run typecheck` | Regenera tipos e verifica TypeScript estrito. |
| `npm test` | Faz o build e executa validação de configuração e integração HTTP/gRPC local. |

Não é necessário instalar `protoc`, Nest CLI ou plugins globalmente. O gerador
seleciona o executável do plugin para Windows ou Linux/macOS sem comandos de shell.
O Dockerfile Alpine instala o pacote `protobuf` e define `PROTOC_PATH=/usr/bin/protoc`
para usar o compilador nativo de musl; fora do container, o padrão é o `grpc-tools`.
Após alterar o IDL, rode `npm run proto:generate` e reinicie o modo de desenvolvimento.
O arquivo gerado é versionado para revisão do contrato; não o edite manualmente.

## Estrutura e limites da entrega

```text
src/
  app.module.ts
  main.ts
  config/         # Leitura e validação do ambiente; localização do contrato
  simulator/      # Modelo náutico, sensores, ciclo e eventos da SCRUM-13
  buffer/         # FIFO, cache limitado e SQLite em worker (SCRUM-15)
  grpc/           # GrpcClientModule, cliente tipado e tipos gerados
  edge-api/       # Health, estado do buffer e ultima coleta
scripts/proto.cjs  # Geração de tipos e empacotamento do IDL
test/             # Testes com o runner nativo do Node.js
```

O `AppModule` importa os quatro módulos fundamentais. TypeScript usa `strict`,
`noUncheckedIndexedAccess`, decorators e metadados de injeção do Nest
(`experimentalDecorators` e `emitDecoratorMetadata`). O código da aplicação é
CommonJS, compatível com os pacotes do NestJS 12 no Node 24.

`TelemetryGrpcClient.enviarTelemetria()` é a base tipada da RPC unária. Os tipos
preservam o `snake_case` do IDL e o loader usa `keepCase: true`. Os campos `int64`
(`timestamp_coleta` e `processado_em`) são strings, tanto no gerador quanto no
loader, evitando perda de precisão. Enums permanecem numéricos.

O simulador inicia a coleta automaticamente. O BufferModule da SCRUM-15 confirma
a persistência de cada pacote antes de enviar pelo cliente resiliente da SCRUM-14.
Durante indisponibilidade da Central, a coleta continua e a cabeça da fila é
preservada. Desabilite `BUFFER_ENABLED=false` em verificações isoladas de infraestrutura.

## Cliente gRPC resiliente (SCRUM-14)

`TelemetryGrpcClient.enviarTelemetria(packet, metadata?)` mantém a API de
Observable frio: uma assinatura inicia uma operação; `firstValueFrom` também
pode ser usado. A operação é independente do temporizador do simulador e não
assina `telemetry.generated` automaticamente. Evite múltiplas assinaturas para
um único envio, pois cada assinatura cria sua própria operação.

O canal configura `grpc.keepalive_time_ms=10000`,
`grpc.keepalive_timeout_ms=5000` e `grpc.keepalive_permit_without_calls=1`.
A Central Python integrada já permite pings sem dados com intervalo de 10s.
Keepalive verifica o transporte; um pacote só dispara o evento offline quando
sua RPC falha. Produção preserva a exigência de certificados mTLS.

Cada tentativa recebe um deadline gRPC novo, por padrão de 2500ms, inclusive
durante conexão/reconexão. A expiração cancela a chamada no transporte com
`DEADLINE_EXCEEDED`. `GRPC_DEADLINE_MS` aceita 1–2500ms, sem ampliar esse teto.
Cancelar a assinatura ou fechar a aplicação também cancela RPCs e timers.
Esperas são assíncronas; uma operação em retry não bloqueia outras chamadas.

Somente `UNAVAILABLE` e `DEADLINE_EXCEEDED` são repetidos. As bases de espera são
2s, 4s, 8s, 16s e 30s, com jitter de ±20% e teto absoluto de 30s. O padrão é
`GRPC_RETRY_MAX_ATTEMPTS=6` (original + cinco retries); aceita 1–10, com 1
desabilitando retries. Após o limite, o Observable devolve o erro gRPC original.
Retries nativos do canal estão desabilitados para evitar tentativas sobrepostas.
Na execução direta, configure o `.env` do barco. No Docker Compose, deadline e
tentativas são injetados a partir do `.env` do orquestrador.

Os retries preservam `message_id`, sequência, timestamp e dados coletados. Apenas
`rede.tentativa_envio` avança a partir do valor recebido. O pacote e os metadados
do chamador não são alterados. `x-correlation-id` é preenchido com `message_id`
quando não informado. ACK de outro UUID falha com `DATA_LOSS`; ACK rejeitado é
devolvido sem retry. ACK aceito ou duplicado permite confirmar a entrega.

### Contrato com o buffer (SCRUM-15)

Eventos e tipos ficam em `src/grpc/telemetry-delivery.events.ts`:

| Evento | Momento e payload |
| --- | --- |
| `telemetry.offline` | Imediato na primeira falha transitória de cada operação, antes de aguardar retry; `{ packet, grpc_code, attempt }` |
| `telemetry.delivery-settled` | Ao finalizar, falhar ou cancelar; `{ packet, attempts, outcome, grpc_code, ack? }` |

O consumidor offline persiste por `message_id`, sem duplicar itens pendentes.
Enquanto a operação estiver ativa, os retries pertencem ao cliente; o buffer
deverá aguardar `delivery-settled` para iniciar sua própria retransmissão.
Somente `outcome=acknowledged` autoriza remover o pacote. `failed` e `cancelled`
preservam a pendência; `rejected` exige tratamento de rejeição, sem confirmação
de entrega. Um status gRPC permanente não aciona offline nem retries.

Os eventos continuam locais e em memória. O BufferModule fornece a persistência;
a garantia de retenção vale para admissões confirmadas no SQLite. Durante o
envio automático a amostra já está persistida quando ocorre o evento offline.
Falha síncrona de listener é registrada sem substituir o resultado da RPC.
Os logs `telemetry.retry` registram UUID, tentativa, status e próxima espera.

## Simulador náutico (SCRUM-13)

A primeira amostra é publicada após `TELEMETRY_INTERVAL_MS` (padrão 5000 ms).
Cada emissão produz UUIDv4 novo em `message_id`, seu alias local `packet_id`,
timestamp de coleta e `sequence_number` a partir de 1. A sequência usa `bigint`
internamente e é reiniciada somente ao reiniciar o processo, não entre viagens.
Os UUIDs continuam aleatórios mesmo com seed fixa.

O evento `telemetry.generated` transporta `GeneratedTelemetryPacket`, um
`TelemetryPacket & { packet_id: string }`. Um consumidor pode usar
`@OnEvent(TELEMETRY_GENERATED_EVENT)`; o alias não faz parte do Protobuf.
O simulador aguarda o registro dos listeners, funciona sem Central/consumidor,
emite uma amostra por ciclo sem rajadas após atrasos e cancela o timer ao encerrar.
O evento é em memória; o consumidor do BufferModule faz a admissão durável e
coordena o envio, quando `BUFFER_ENABLED=true`.

O trajeto é uma geodésica sintética São Joaquim (-12.9482, -38.5028) ↔ Bom
Despacho (-12.9774, -38.5724). O barco começa atracado, aguarda 30s, acelera e
freia a 0,1 m/s², para no destino e retorna após outra atracação de 30s. A física
usa tempo monotônico e subpassos de até 1s. Os logs apresentam UUID, sequência,
sentido e estado operacional a cada amostra.

| Variável | Modelo sintético |
| --- | --- |
| Velocidade | 10–14 nós em cruzeiro, referência 12 nós, maré senoidal de 12h e ruído suave; zero atracado |
| GPS | Ruído gaussiano suavizado limitado a 10m; coordenadas exatas atracado; rumo verdadeiro em [0, 360) |
| Qualidade GPS | 8–14 satélites e HDOP 0,8–2,0, com relação inversa |
| Motor | 1500–1850 RPM em cruzeiro; 750 RPM em marcha lenta; temperatura 78–92°C |
| Sistema elétrico | Tensão suavizada limitada a 24–27V |
| Combustível | Tanque cheio de 2000 L; consumo 8 + 152 × carga³ L/h, integrado no tempo |

Velocidade e RPM podem ficar abaixo das faixas de cruzeiro durante manobras.
Ao esgotar o tanque, o barco para em emergência, zera motor e consumo e continua
emitindo amostras. Não há reabastecimento automático. Passageiros são zero;
RSSI, RTT, perda e tamanho do buffer usam zero como placeholder não medido,
`tipo_enlace=UNSPECIFIED` e `tentativa_envio=1`.

Parâmetros adicionais em `.env`: `SIMULATOR_ENABLED=true`,
`SIMULATOR_DOCK_TIME_MS=30000`, `SIMULATOR_FUEL_CAPACITY_L=2000` e
`SIMULATOR_SEED` opcional (inteiro de 0 a 4294967295). Nos testes de infraestrutura,
desabilite explicitamente com `SIMULATOR_ENABLED=false`. A seed reproduz os
sensores sob a mesma progressão de tempo; relógio e scheduler são injetáveis.

O contrato adiciona campos opcionais: `sequence_number` (uint64, tag 8),
`navegacao.hdop` (double, tag 6), `navegacao.satelites` (uint32, tag 7) e
`propulsao.tensao_bateria_volts` (double, tag 6). Sequência e timestamps trafegam
como strings no TypeScript. Mensagens antigas continuam válidas; a Central antiga
ignora os campos novos. Armazenamento e visualização desses campos na Central
exigem sua própria implementação.

Para validar o IDL na pasta `proto` do orquestrador:

```powershell
npm exec --yes --package=@bufbuild/buf@1.75.0 -- buf lint
npm exec --yes --package=@bufbuild/buf@1.75.0 -- buf breaking --against ../ferry-boat/test/fixtures/legacy
```

Estes parâmetros são de demonstração, sem calibração para uma embarcação, maré
ou rota operacional real.

## Buffer FIFO persistente (SCRUM-15)

A fila usa SQLite nativo do Node 24 em worker dedicado. Cada admissão é gravada
em transação com WAL e `synchronous=FULL` antes de iniciar a RPC. A janela em
RAM é limitada a `BUFFER_MAX_ITEMS`; o excedente permanece apenas em disco e
é lido conforme a cabeça avança. Todos os pacotes, inclusive os presentes no
cache, já estão persistidos. O limite de RAM não causa descarte nem limita o
total de amostras retidas.

A posição FIFO persistida representa a ordem de entrada do fluxo de coleta,
que é cronológico no simulador. Memória, disco, novas coletas e reinícios usam
a mesma ordem. O contador `sequence_number` pode reiniciar por execução sem
reposicionar pacotes novos à frente de coletas antigas. UUIDs pendentes são
deduplicados, preservando a primeira coleta.

Existe somente uma operação gRPC ativa do buffer. A cabeça permanece retida
durante todos os retries do cliente. Somente ACK aceito ou duplicado do mesmo
UUID permite removê-la; há pausa mínima de 20ms após confirmar e persistir a
remoção, com limite teórico de 50 envios/s. O diagnóstico de envio recebe o
`tamanho_buffer_local` real sem alterar a coleta original.

Após esgotar falhas transitórias, o buffer aguarda 5s e tenta novamente a cabeça.
Novas amostras continuam entrando no fim da fila. Rejeição ou erro permanente
coloca a fila em `blocked`, sem pular nem descartar o pacote; exige intervenção
na causa da rejeição. Falha de disco sinaliza `storage_error` e impede continuar
o descarregamento. Uma admissão que não consiga concluir o commit rejeita com
erro e é registrada nos logs; a operação exige disco gravável e espaço disponível.

Se houver queda depois do aceite remoto e antes da remoção local, o mesmo UUID
será retransmitido. A garantia é de entrega pelo menos uma vez, com idempotência
na Central. O último pacote coletado permanece salvo mesmo após esvaziar a fila.
No encerramento, timers/RPC são cancelados e as admissões pendentes terminam
antes de fechar o banco.

| Variável | Padrão e finalidade |
| --- | --- |
| `BUFFER_ENABLED` | `true`; `false` desliga persistência e envio automático |
| `BUFFER_MAX_ITEMS` | `5000`; cache de 1–100000 pacotes, não capacidade total |
| `BUFFER_BACKUP_PATH` | `./data/telemetry-buffer.sqlite`; caminho relativo ao barco ou absoluto |
| `BUFFER_DRAIN_INTERVAL_MS` | `20`; pausa mínima após cada confirmação, maior que zero |
| `BUFFER_RETRY_INTERVAL_MS` | `5000`; espera após esgotar retries transitórios, maior que zero |

No Compose, as variáveis vêm do `.env` do orquestrador. O caminho padrão fica
em `/app/data/telemetry-buffer.sqlite`, dentro de `boat-buffer`. O nome da variável
`BUFFER_BACKUP_PATH` foi mantido; o formato agora é SQLite, independentemente
da extensão configurada. Um arquivo JSON antigo não é convertido nem apagado
automaticamente: configure um caminho SQLite novo para preservar esse arquivo.

Um único processo pode consumir cada arquivo. Outra instância recebe erro de
bloqueio. A recuperação após queda usa o WAL; preserve o banco e seus arquivos
auxiliares no mesmo volume. Para copiar um backup, encerre a aplicação antes
ou use uma ferramenta de backup SQLite, mantendo uma cópia consistente.

### API interna para o Painel do Capitão

- `GET /telemetry/buffer/status`: estado e contadores, sem acessar disco no loop HTTP.
- `GET /telemetry/latest`: última coleta persistida completa, inclusive após restart
  ou drain; HTTP 404 enquanto ainda não há coleta.

Ambas as respostas usam `Cache-Control: no-store`. Timestamps e sequência são
strings. Nas coletas do simulador, `latest` preserva o alias local
`packet_id=message_id`; esse alias não é serializado na RPC Protobuf.

| Campo de status | Significado |
| --- | --- |
| `enabled`, `state` | Habilitação e estado: disabled, idle, draining, offline, blocked ou storage_error |
| `pending_count` | Total de pacotes admitidos ainda sem remoção confirmada |
| `memory_count`, `disk_count` | Janela RAM e excedente exclusivamente em disco; somam o total pendente |
| `memory_limit` | Limite configurado para a janela RAM |
| `in_flight` | UUID em envio, ou null; pode continuar preenchido durante retries do cliente |
| `oldest_timestamp` | Timestamp da cabeça, ou null |
| `next_retry_at` | Epoch em ms da próxima tentativa do buffer, ou null durante retries internos do cliente |
| `last_ack_at` | Epoch em ms da última confirmação/remoção local desta execução, ou null |
| `last_error` | Causa operacional resumida, ou null |

Exemplo de consulta local:

```powershell
Invoke-RestMethod http://localhost:3002/telemetry/buffer/status
Invoke-RestMethod http://localhost:3002/telemetry/latest
```

`/health` continua verificando o processo do barco. A Central não precisa estar
disponível para os endpoints de bordo responderem.

## Ambiente e segurança do canal

O [.env.example](.env.example) documenta host/porta da API, endereço da Central,
identificador do barco, ciclo de envio e parâmetros de resiliência/persistência.
Valores inválidos impedem a inicialização com uma mensagem indicando a variável.

Para o mTLS previsto na arquitetura, configure `GRPC_TLS_CA_PATH`,
`GRPC_TLS_CERT_PATH` e `GRPC_TLS_KEY_PATH` com arquivos PEM emitidos pela CA do
projeto. Os três devem ser fornecidos juntos; `NODE_ENV=production` exige mTLS.
Desenvolvimento/testes sem certificados usam o transporte local sem TLS.
Arquivos de ambiente, certificados e chaves privadas são ignorados pelo Git.

Caminhos relativos de certificados e de `TELEMETRY_PROTO_PATH` são resolvidos
a partir da raiz de `ferry-boat`. O contrato é procurado no diretório irmão
`../proto`, no volume `/proto` do Docker e, em execução de um build isolado,
em `dist/proto`. Um override explícito deve existir e não usa fallback silencioso.

## Docker Compose e Git

O Compose e o Dockerfile de desenvolvimento ficam no orquestrador. O serviço já
injeta `CENTRAL_GRPC_URL=ferry-central:50051`, `API_PORT=3002` e monta o IDL em
`/proto`. O comando existente `npm run start:dev` passa a funcionar com este setup.
A execução completa também depende da implementação do submódulo `ferry-central`.

O CI do barco usa o contrato da branch de mesmo nome no orquestrador, quando
ela existe; caso contrário, usa a main. Em pushes para main, o contrato vem da
main do orquestrador. Assim, os PRs correspondentes podem ser validados juntos,
mas o contrato deve ser integrado antes da implementação do barco.

Para validar o nó embarcado, execute na raiz do orquestrador:

```powershell
docker compose -f docker-compose.local.yml build ferry-boat
docker compose -f docker-compose.local.yml run --rm --no-deps -T -e BUFFER_ENABLED=false ferry-boat sh -c "npm ci && npm test && npm run typecheck"
docker compose -f docker-compose.local.yml up -d --no-deps --wait --wait-timeout 120 ferry-boat
```

`BUFFER_ENABLED=false` isola os testes de infraestrutura do volume de produção;
os testes do buffer habilitam explicitamente suas instâncias em arquivos temporários.
O `--no-deps` permite verificar o barco antes de iniciar a Central e os demais
serviços. Confira `http://localhost:3002/health` e o estado `healthy` com
`docker compose -f docker-compose.local.yml ps ferry-boat`. Para parar apenas o
barco, use `docker compose -f docker-compose.local.yml stop ferry-boat`.

O barco não depende do healthcheck da Central no Compose: pode iniciar e
restaurar a fila durante uma partição, mantendo coleta e consultas locais.

O nó embarcado é um submódulo: seus arquivos, commits e PR pertencem ao repositório
`ferry-boat`. Para esta entrega, use a branch `feature/SCRUM-15-buffer-fifo-offline`,
o padrão `feat(SCRUM-15): implementa fila fifo persistente` e o título de PR
`[SCRUM-15] Implementa buffer FIFO persistente`.
Ticket: [SCRUM-15](https://rafafigolif.atlassian.net/browse/SCRUM-15).
Após integrar a mudança no submódulo,
atualize a referência de `ferry-boat` no orquestrador pelo fluxo de revisão da equipe.

Durante a revisão local, mantenha o submódulo na branch da entrega.
`git submodule update` restaura o commit registrado no orquestrador, que pode
anteceder a feature em revisão. Para conferir a versão em uso, execute
`git -C ferry-boat branch --show-current` a partir da raiz do orquestrador.

Nas branches, registre um commit por arquivo alterado ou por alteração lógica
individual, sempre com descrição específica e referência ao ticket. Adicione
somente o arquivo correspondente com `git add -- caminho/do/arquivo` e confira
`git diff --cached` antes de comitar. Se um arquivo contiver mudanças independentes,
separe os trechos com `git add -p`; evite reunir várias alterações independentes em
um commit genérico. Essa regra também se aplica aos commits do orquestrador.

Referências técnicas: [cliente gRPC do Nest](https://docs.nestjs.com/microservices/grpc),
[deadlines](https://grpc.io/docs/guides/deadlines/),
[keepalive](https://grpc.io/docs/guides/keepalive/) e
[retries](https://grpc.io/docs/guides/retry/),
[SQLite WAL](https://sqlite.org/wal.html),
[compatibilidade do Nest 12](https://docs.nestjs.com/migration-guide) e
[opções do ts-proto](https://github.com/stephenh/ts-proto).
