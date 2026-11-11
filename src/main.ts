import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BoatEnvironment } from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<BoatEnvironment, true>);
  app.enableShutdownHooks();
  await app.listen(
    config.get('API_PORT', { infer: true }),
    config.get('API_HOST', { infer: true }),
  );
  Logger.log(`API do barco disponível em ${await app.getUrl()}`, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : 'Falha ao iniciar o nó embarcado.', undefined, 'Bootstrap');
  process.exitCode = 1;
});
