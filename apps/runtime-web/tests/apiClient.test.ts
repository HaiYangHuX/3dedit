import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtimeApiRequest } from '../src/api/client';

describe('runtimeApiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('默认请求指向平台 API 端口而不是本机其他服务', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await runtimeApiRequest('/assets/asset-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/api/assets/asset-1',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});
