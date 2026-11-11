import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BufferModule } from './buffer/buffer.module';
import { validateEnvironment } from './config/environment';
import { EdgeApiModule } from './edge-api/edge-api.module';
import { GrpcClientModule } from './grpc/grpc-client.module';
import { GpsSimulatorModule } from './simulator/gps-simulator.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment }),
    EventEmitterModule.forRoot(),
    GpsSimulatorModule,
    BufferModule,
    GrpcClientModule,
    EdgeApiModule,
  ],
})
export class AppModule {}
