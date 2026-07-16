import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../src/api/client';

describe('apiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('将非 2xx 响应转换为可展示的 ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue({
          code: 'REVISION_CONFLICT',
          message: '场景已被修改',
        }),
      }),
    );

    const request = apiRequest('/scenes/scene-1');

    await expect(request).rejects.toMatchObject({
      status: 409,
      code: 'REVISION_CONFLICT',
      message: '场景已被修改',
    });
    await expect(request).rejects.toBeInstanceOf(ApiError);
  });

  it('网络异常使用统一中文错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(apiRequest('/projects')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: '无法连接平台服务',
    });
  });
});
