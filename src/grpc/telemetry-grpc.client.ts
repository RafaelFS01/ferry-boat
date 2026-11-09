import type { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Observable } from 'rxjs';
import { TELEMETRY_GRPC_CLIENT } from './grpc-client.constants';
import {
  TELEMETRY_SERVICE_NAME,
  TelemetryAck,
  TelemetryPacket,
  TelemetryServiceClient,
} from './telemetry';

@Injectable()
export class TelemetryGrpcClient implements OnModuleInit {
  private service!: TelemetryServiceClient;

  constructor(@Inject(TELEMETRY_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.service = this.client.getService<TelemetryServiceClient>(TELEMETRY_SERVICE_NAME);
  }

  // Base tipada da RPC; deadlines, keepalive e retries serão tratados na SCRUM-14.
  enviarTelemetria(packet: TelemetryPacket, metadata?: Metadata): Observable<TelemetryAck> {
    return this.service.enviarTelemetria(packet, metadata);
  }
}
