import type { HealthResponse } from '@digital-twin/api-contracts';
import { Inject, Injectable } from '@nestjs/common';
import { MinioService } from '../infrastructure/minio.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { RedisService } from '../infrastructure/redis.service.js';

interface HealthProbe {
  ping(): Promise<unknown>;
}

/** 聚合平台基础设施状态，单个依赖失败不会阻断其他检查。 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly postgres: HealthProbe,
    @Inject(RedisService) private readonly redis: HealthProbe,
    @Inject(MinioService) private readonly minio: HealthProbe,
  ) {}

  async check(): Promise<HealthResponse> {
    const [postgres, redis, minio] = await Promise.allSettled([
      this.postgres.ping(),
      this.redis.ping(),
      this.minio.ping(),
    ]);
    const services: HealthResponse['services'] = {
      postgres: postgres.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
      minio: minio.status === 'fulfilled' ? 'up' : 'down',
    };

    return {
      status: Object.values(services).every((status) => status === 'up')
        ? 'ok'
        : 'degraded',
      services,
      timestamp: new Date().toISOString(),
    };
  }
}
