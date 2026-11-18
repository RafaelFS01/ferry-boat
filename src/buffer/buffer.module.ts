import { Module } from '@nestjs/common';
import { GrpcClientModule } from '../grpc/grpc-client.module';
import { BUFFER_RUNTIME, bufferRuntime } from './buffer-runtime';
import { FifoBufferService } from './fifo-buffer.service';
import { SqliteBufferStore } from './sqlite-buffer.store';

@Module({
  imports: [GrpcClientModule],
  providers: [{ provide: BUFFER_RUNTIME, useValue: bufferRuntime }, SqliteBufferStore, FifoBufferService],
  exports: [FifoBufferService],
})
export class BufferModule {}
