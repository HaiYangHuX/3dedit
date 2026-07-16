import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * 平台唯一的 PrismaClient 所有者。
 * 不在应用启动阶段强制连库，这样依赖故障时健康接口仍能报告 degraded。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
