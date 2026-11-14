import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { FifoBufferService } from '../buffer/fifo-buffer.service';
import type { BufferStatus } from '../buffer/buffer.types';
import type { TelemetryPacket } from '../grpc/telemetry';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly buffer: FifoBufferService) {}

  @Get('buffer/status')
  @Header('Cache-Control', 'no-store')
  getBufferStatus(): BufferStatus { return this.buffer.getStatus(); }

  @Get('latest')
  @Header('Cache-Control', 'no-store')
  getLatest(): TelemetryPacket {
    const packet = this.buffer.getLatest();
    if (!packet) throw new NotFoundException('Nenhuma telemetria coletada.');
    return packet;
  }
}
