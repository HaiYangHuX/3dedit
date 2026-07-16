import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { MinioService } from './infrastructure/minio.service.js';
import { PrismaService } from './infrastructure/prisma.service.js';
import { RedisService } from './infrastructure/redis.service.js';

/** 首期模块化单体入口，后续业务域按 Nest Module 水平拆分而非拆成微服务。 */
@Module({
  controllers: [HealthController],
  providers: [HealthService, PrismaService, RedisService, MinioService],
})
export class AppModule {}
