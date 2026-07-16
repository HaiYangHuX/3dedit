import { describe, expect, it } from 'vitest';
import { processFoundationPing } from '../src/jobs/foundationPing.js';

describe('processFoundationPing', () => {
  it('返回可序列化的 Worker 心跳', async () => {
    await expect(processFoundationPing('worker-test')).resolves.toEqual({
      ok: true,
      workerId: 'worker-test',
    });
  });
});
