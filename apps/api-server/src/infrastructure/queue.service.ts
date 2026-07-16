import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { AnalyzeAssetJobData } from '@digital-twin/api-contracts';
import { Queue } from 'bullmq';

const ASSET_QUEUE_NAME = 'asset-processing';

/** BullMQ 生产者单例；jobId 使用数据库任务 ID，重复提交不会产生重复解析。 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue = new Queue<AnalyzeAssetJobData>(ASSET_QUEUE_NAME, {
    connection: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' },
  });

  async enqueueAssetAnalysis(
    data: AnalyzeAssetJobData,
    jobId?: string,
  ): Promise<void> {
    await this.queue.add('analyze-asset', data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
