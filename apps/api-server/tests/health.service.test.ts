import { describe, expect, it, vi } from 'vitest';
import { HealthService } from '../src/health/health.service.js';

describe('HealthService', () => {
  it('三个依赖可用时返回 ok', async () => {
    const service = new HealthService(
      { ping: vi.fn().mockResolvedValue(undefined) },
      { ping: vi.fn().mockResolvedValue('PONG') },
      { ping: vi.fn().mockResolvedValue(undefined) },
    );

    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      services: { postgres: 'up', redis: 'up', minio: 'up' },
    });
  });

  it('任一依赖失败时返回 degraded', async () => {
    const service = new HealthService(
      { ping: vi.fn().mockRejectedValue(new Error('database down')) },
      { ping: vi.fn().mockResolvedValue('PONG') },
      { ping: vi.fn().mockResolvedValue(undefined) },
    );

    await expect(service.check()).resolves.toMatchObject({
      status: 'degraded',
      services: { postgres: 'down', redis: 'up', minio: 'up' },
    });
  });
});
