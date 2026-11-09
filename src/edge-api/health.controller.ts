import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BoatEnvironment } from '../config/environment';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService<BoatEnvironment, true>) {}

  @Get()
  getHealth(): { status: 'ok'; boat_id: string } {
    return {
      status: 'ok',
      boat_id: this.config.get('BOAT_ID', { infer: true }),
    };
  }
}
