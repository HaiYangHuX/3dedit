import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

/** 封装 Redis 连接生命周期，业务模块不得重复创建 ioredis 客户端。 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    },
  );

  constructor() {
    // ioredis 会在后台持续重连；故障由 ping 返回给健康检查，避免未监听 error 导致进程噪声。
    this.client.on('error', () => undefined);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }
    this.client.disconnect();
  }
}
