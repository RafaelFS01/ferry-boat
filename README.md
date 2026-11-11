# Nó embarcado — ferry-boat (SCRUM-10)

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
  buffer/         # BufferModule — implementação na SCRUM-15
  grpc/           # GrpcClientModule, cliente tipado e tipos gerados
  edge-api/       # EdgeApiModule e GET /health
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

O simulador inicia a coleta automaticamente; o envio à Central será conectado
pelo consumidor de eventos nas próximas tarefas. Persistência FIFO, deadlines,
keepalive, retries e descarregamento da fila permanecem nas SCRUM-15 e SCRUM-14.
`GRPC_DEADLINE_MS` e as variáveis do buffer ficam documentados e validados.

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
O evento é apenas em memória: ainda não há garantia de armazenamento ou entrega.

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

## Ambiente e segurança do canal

O [.env.example](.env.example) documenta host/porta da API, endereço da Central,
identificador do barco, ciclo de envio e parâmetros futuros de resiliência.
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

Para validar apenas o setup da SCRUM-10, execute na raiz do orquestrador:

```powershell
docker compose -f docker-compose.local.yml build ferry-boat
docker compose -f docker-compose.local.yml run --rm --no-deps -T ferry-boat sh -c "npm ci && npm test && npm run typecheck"
docker compose -f docker-compose.local.yml up -d --no-deps --wait --wait-timeout 120 ferry-boat
```

O `--no-deps` permite verificar o barco antes de iniciar a Central e os demais
serviços. Confira `http://localhost:3002/health` e o estado `healthy` com
`docker compose -f docker-compose.local.yml ps ferry-boat`. Para parar apenas o
barco, use `docker compose -f docker-compose.local.yml stop ferry-boat`.

O nó embarcado é um submódulo: seus arquivos, commits e PR pertencem ao repositório
`ferry-boat`. Trabalhe na branch `feature/SCRUM-10-setup-barco-nestjs`, use o padrão
`feat(SCRUM-10): declara modulo do simulador gps` e o título de PR
`[SCRUM-10] Setup do nó embarcado NestJS`. Após integrar a mudança no submódulo,
atualize a referência de `ferry-boat` no orquestrador pelo fluxo de revisão da equipe.

Nas branches, registre um commit por arquivo alterado ou por alteração lógica
individual, sempre com descrição específica e referência ao ticket. Adicione
somente o arquivo correspondente com `git add -- caminho/do/arquivo` e confira
`git diff --cached` antes de comitar. Se um arquivo contiver mudanças independentes,
separe os trechos com `git add -p`; evite reunir várias alterações independentes em
um commit genérico. Essa regra também se aplica aos commits do orquestrador.

Referências técnicas: [cliente gRPC do Nest](https://docs.nestjs.com/microservices/grpc),
[compatibilidade do Nest 12](https://docs.nestjs.com/migration-guide) e
[opções do ts-proto](https://github.com/stephenh/ts-proto).
