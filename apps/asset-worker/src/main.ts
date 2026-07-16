import { randomUUID } from 'node:crypto';
import type { AnalyzeAssetJobData } from '@digital-twin/api-contracts';
import { type Job, Worker } from 'bullmq';
import { createWorkerInfrastructure } from './infrastructure.js';
import { analyzeAsset } from './jobs/analyzeAsset.js';
import { processFoundationPing } from './jobs/foundationPing.js';

const QUEUE_NAME = 'asset-processing';
const workerId = process.env.WORKER_ID ?? `asset-worker-${randomUUID()}`;
const infrastructure = createWorkerInfrastructure();

/**
 * 资源队列的单一调度入口。
 * 任务名是持久化协议的一部分，未知名称必须失败而不能被静默忽略。
 */
async function processJob(job: Job): Promise<unknown> {
  switch (job.name) {
    case 'foundation-ping':
      return processFoundationPing(workerId);
    case 'analyze-asset':
      return analyzeAsset(
        job.data as AnalyzeAssetJobData,
        {
          storage: infrastructure.storage,
          repository: infrastructure.repository,
        },
        job.id,
      );
    default:
      throw new Error(`不支持的资源任务: ${job.name}`);
  }
}

const worker = new Worker(QUEUE_NAME, processJob, {
  // BullMQ 自行创建并拥有 Redis 连接，worker.close() 会一并释放它。
  connection: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' },
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
});

worker.on('ready', () => {
  console.info(`[${workerId}] 已监听 ${QUEUE_NAME} 队列`);
});
worker.on('failed', (job, error) => {
  console.error(`[${workerId}] 任务 ${job?.id ?? 'unknown'} 执行失败`, error);
});
worker.on('error', (error) => {
  console.error(`[${workerId}] Worker 连接错误`, error);
});

let closing = false;

/** 等待正在执行的资源任务结束，避免在写 MinIO 或数据库时被强制中断。 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (closing) return;
  closing = true;
  console.info(`[${workerId}] 收到 ${signal}，正在关闭 Worker`);
  await worker.close();
  await infrastructure.prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdown(signal).catch((error: unknown) => {
      console.error(`[${workerId}] Worker 关闭失败`, error);
      process.exitCode = 1;
    });
  });
}
