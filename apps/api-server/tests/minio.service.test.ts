import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ClientMock, clients } = vi.hoisted(() => {
  const clients: Array<{
    bucketExists: ReturnType<typeof vi.fn>;
    presignedUrl: ReturnType<typeof vi.fn>;
    presignedGetObject: ReturnType<typeof vi.fn>;
  }> = [];
  const ClientMock = vi.fn(function () {
    const client = {
      bucketExists: vi.fn().mockResolvedValue(true),
      presignedUrl: vi.fn().mockResolvedValue('signed-put-url'),
      presignedGetObject: vi.fn().mockResolvedValue('signed-get-url'),
    };
    clients.push(client);
    return client;
  });
  return { ClientMock, clients };
});

vi.mock('minio', () => ({ Client: ClientMock }));

describe('MinioService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    clients.length = 0;
    process.env = {
      ...originalEnv,
      MINIO_ACCESS_KEY: 'access',
      MINIO_BUCKET: 'three3d-assets',
      MINIO_ENDPOINT: 'minio',
      MINIO_PORT: '9000',
      MINIO_PUBLIC_ENDPOINT: 'three3d.cc.cd',
      MINIO_PUBLIC_PORT: '80',
      MINIO_PUBLIC_USE_SSL: 'false',
      MINIO_REGION: 'us-east-1',
      MINIO_SECRET_KEY: 'secret',
      MINIO_USE_SSL: 'false',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses the internal MinIO endpoint for storage and the public endpoint for presigned URLs', async () => {
    const { MinioService } = await import(
      '../src/infrastructure/minio.service.js'
    );
    const service = new MinioService();

    expect(ClientMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        endPoint: 'minio',
        port: 9000,
        region: 'us-east-1',
      }),
    );
    expect(ClientMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        endPoint: 'three3d.cc.cd',
        port: 80,
        region: 'us-east-1',
      }),
    );

    await service.ping();
    await service.presignUploadPart('assets/model.glb', 'upload-id', 2, 60);

    expect(clients[0]!.bucketExists).toHaveBeenCalledWith('three3d-assets');
    expect(clients[0]!.presignedUrl).not.toHaveBeenCalled();
    expect(clients[1]!.presignedUrl).toHaveBeenCalledWith(
      'PUT',
      'three3d-assets',
      'assets/model.glb',
      60,
      { uploadId: 'upload-id', partNumber: '2' },
    );
  });
});
