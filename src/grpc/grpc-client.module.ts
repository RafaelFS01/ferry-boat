import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentials } from '@grpc/grpc-js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BoatEnvironment } from '../config/environment';
import { PROJECT_ROOT, resolveTelemetryProtoPath } from '../config/proto-path';
import { TELEMETRY_GRPC_CLIENT } from './grpc-client.constants';
import { GRPC_CHANNEL_OPTIONS, GRPC_RETRY_RUNTIME, grpcRetryRuntime } from './grpc-resilience';
import { FERRY_TELEMETRY_V1_PACKAGE_NAME } from './telemetry';
import { TelemetryGrpcClient } from './telemetry-grpc.client';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: TELEMETRY_GRPC_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService<BoatEnvironment, true>) => {
          const caPath = config.get('GRPC_TLS_CA_PATH', { infer: true });
          const certPath = config.get('GRPC_TLS_CERT_PATH', { infer: true });
          const keyPath = config.get('GRPC_TLS_KEY_PATH', { infer: true });
          const channelCredentials = caPath && certPath && keyPath
            ? credentials.createSsl(
                readFileSync(resolve(PROJECT_ROOT, caPath)),
                readFileSync(resolve(PROJECT_ROOT, keyPath)),
                readFileSync(resolve(PROJECT_ROOT, certPath)),
              )
            : credentials.createInsecure();

          return {
            transport: Transport.GRPC,
            options: {
              url: config.get('CENTRAL_GRPC_URL', { infer: true }),
              package: FERRY_TELEMETRY_V1_PACKAGE_NAME,
              protoPath: resolveTelemetryProtoPath(config.get('TELEMETRY_PROTO_PATH', { infer: true })),
              credentials: channelCredentials,
              channelOptions: { ...GRPC_CHANNEL_OPTIONS },
              loader: {
                keepCase: true,
                longs: String,
                defaults: true,
                oneofs: true,
              },
            },
          };
        },
      },
    ]),
  ],
  providers: [
    { provide: GRPC_RETRY_RUNTIME, useValue: grpcRetryRuntime },
    TelemetryGrpcClient,
  ],
  exports: [TelemetryGrpcClient],
})
export class GrpcClientModule {}
