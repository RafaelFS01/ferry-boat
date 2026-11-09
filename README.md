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
  simulator/      # GpsSimulatorModule — implementação na SCRUM-13
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

Esta entrega não inicia coleta nem envia pacotes automaticamente. Simulador,
persistência FIFO, deadlines, keepalive, retries e descarregamento da fila serão
implementados nas tarefas seguintes. `GRPC_DEADLINE_MS` e as variáveis do buffer
já ficam documentados e validados para essa integração.

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
