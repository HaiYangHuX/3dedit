import { Injectable } from '@nestjs/common';
import { Client } from 'minio';

/** MinIO 客户端单例，ping 同时验证平台资源桶已创建。 */
@Injectable()
export class MinioService {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'assets';
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT ?? '127.0.0.1',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'digital-twin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'digital-twin-secret',
  });

  async ping(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) throw new Error(`MinIO 资源桶 ${this.bucket} 不存在`);
  }
}
