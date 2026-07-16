import { Injectable } from '@nestjs/common';
import { Client } from 'minio';

export interface CompletedMultipartPart {
  partNumber: number;
  etag: string;
}

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

  /**
   * 创建由浏览器直传的 Multipart 会话。
   * MinIO 的底层方法属于 SDK 细节，业务服务只接触 uploadId 和稳定 objectKey。
   */
  createMultipartUpload(objectKey: string, mimeType: string): Promise<string> {
    return this.client.initiateNewMultipartUpload(this.bucket, objectKey, {
      'content-type': mimeType,
    });
  }

  /** 为单个分片签发 PUT 地址，浏览器无需持有对象存储密钥。 */
  presignUploadPart(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    expiresSeconds = 24 * 60 * 60,
  ): Promise<string> {
    return this.client.presignedUrl(
      'PUT',
      this.bucket,
      objectKey,
      expiresSeconds,
      { uploadId, partNumber: String(partNumber) },
    );
  }

  /** 完成前由 UploadService 校验分片集合，这里只负责适配 MinIO 的字段名。 */
  completeMultipartUpload(
    objectKey: string,
    uploadId: string,
    parts: CompletedMultipartPart[],
  ): Promise<unknown> {
    return this.client.completeMultipartUpload(
      this.bucket,
      objectKey,
      uploadId,
      parts.map(({ partNumber, etag }) => ({ part: partNumber, etag })),
    );
  }

  abortMultipartUpload(objectKey: string, uploadId: string): Promise<void> {
    return this.client.abortMultipartUpload(this.bucket, objectKey, uploadId);
  }

  /** 返回短时效下载地址，数据库和 API 永远只保存稳定 objectKey。 */
  presignGet(objectKey: string, expiresSeconds = 3_600): Promise<string> {
    return this.client.presignedGetObject(
      this.bucket,
      objectKey,
      expiresSeconds,
    );
  }

  /** 资源数据库事务提交后清理其所有源文件和派生文件。 */
  async removePrefix(prefix: string): Promise<void> {
    const objectNames: string[] = [];
    for await (const item of this.client.listObjectsV2(
      this.bucket,
      prefix,
      true,
    )) {
      if (item.name) objectNames.push(item.name);
    }
    if (objectNames.length > 0) {
      await this.client.removeObjects(this.bucket, objectNames);
    }
  }
}
