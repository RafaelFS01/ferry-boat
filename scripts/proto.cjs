const { existsSync, mkdirSync, copyFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const override = process.env.TELEMETRY_PROTO_PATH;
const candidates = override
  ? [path.resolve(projectRoot, override)]
  : [
      path.resolve(projectRoot, '../proto/telemetry.proto'),
      path.resolve('/proto/telemetry.proto'),
    ];
const protoPath = candidates.find((candidate) => existsSync(candidate));

if (!protoPath) {
  console.error(
    'Contrato telemetry.proto não encontrado. Use o submódulo dentro de ' +
      'ferry-telemetry-tde ou defina TELEMETRY_PROTO_PATH. Caminhos: ' +
      candidates.join(', '),
  );
  process.exit(1);
}

const command = process.argv[2];
if (command === 'copy') {
  const destination = path.join(projectRoot, 'dist/proto/telemetry.proto');
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(protoPath, destination);
} else if (command === 'generate') {
  const outputDirectory = path.join(projectRoot, 'src/grpc');
  mkdirSync(outputDirectory, { recursive: true });
  const plugin = path.join(
    projectRoot,
    'node_modules/.bin/protoc-gen-ts_proto' +
      (process.platform === 'win32' ? '.cmd' : ''),
  );
  const nativeProtoc = process.env.PROTOC_PATH;
  const result = spawnSync(
    nativeProtoc || process.execPath,
    [
      ...(nativeProtoc ? [] : [require.resolve('grpc-tools/bin/protoc.js')]),
      `--plugin=protoc-gen-ts_proto=${plugin}`,
      `--proto_path=${path.dirname(protoPath)}`,
      `--ts_proto_out=${outputDirectory}`,
      '--ts_proto_opt=nestJs=true,snakeToCamel=false,forceLong=string,addGrpcMetadata=true',
      path.basename(protoPath),
    ],
    { cwd: projectRoot, stdio: 'inherit' },
  );
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
} else {
  console.error('Uso: node scripts/proto.cjs generate|copy');
  process.exit(1);
}
