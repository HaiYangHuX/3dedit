import { Global, Module } from '@nestjs/common';
import { MinioService } from './minio.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

/** 基础设施客户端必须保持进程级单例，避免每个业务模块创建额外连接池。 */
@Global()
@Module({
  providers: [PrismaService, RedisService, MinioService],
  exports: [PrismaService, RedisService, MinioService],
})
export class InfrastructureModule {}
