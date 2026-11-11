import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { BoatEnvironment } from '../config/environment';
import { GpsSimulatorService } from './gps-simulator.service';
import { createSeededRandom } from './random';
import {
  SIMULATOR_CLOCK, SIMULATOR_SCHEDULER, SIMULATOR_RANDOM, systemClock, systemScheduler,
} from './simulator-runtime';

@Module({
  providers: [
    { provide: SIMULATOR_CLOCK, useValue: systemClock },
    { provide: SIMULATOR_SCHEDULER, useValue: systemScheduler },
    {
      provide: SIMULATOR_RANDOM,
      inject: [ConfigService],
      useFactory: (config: ConfigService<BoatEnvironment, true>) =>
        createSeededRandom(config.get('SIMULATOR_SEED', { infer: true }) ?? randomBytes(4).readUInt32LE()),
    },
    GpsSimulatorService,
  ],
  exports: [GpsSimulatorService],
})
export class GpsSimulatorModule {}
