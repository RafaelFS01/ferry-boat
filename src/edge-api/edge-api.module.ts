import { Module } from '@nestjs/common';
import { BufferModule } from '../buffer/buffer.module';
import { HealthController } from './health.controller';
import { TelemetryController } from './telemetry.controller';

@Module({ imports: [BufferModule], controllers: [HealthController, TelemetryController] })
export class EdgeApiModule {}
