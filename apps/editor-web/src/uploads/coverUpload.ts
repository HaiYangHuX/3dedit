import type { UploadPurpose } from '@digital-twin/api-contracts';
import { assetApi } from '../api/assets';
import { hashFile } from './hashFile';
import { uploadMultipart } from './multipartUpload';

export type StandaloneCoverPurpose = Extract<
  UploadPurpose,
  'project-cover' | 'scene-cover'
>;

export interface StoredCover {
  objectKey: string;
  url: string;
}

/** 项目类封面只写对象存储，不创建模型与素材记录。 */
export async function uploadCoverFile(
  file: File,
  purpose: StandaloneCoverPurpose,
): Promise<StoredCover> {
  const session = await assetApi.createUpload({
    fileName: file.name,
    size: file.size,
    sha256: await hashFile(file),
    mimeType: file.type || 'application/octet-stream',
    purpose,
  });
  try {
    const parts = await uploadMultipart(file, session, { concurrency: 3 });
    const completion = await assetApi.completeUpload(session.id, { parts });
    if (completion.status !== 'stored') {
      throw new Error('封面上传完成但未返回对象地址');
    }
    return {
      objectKey: completion.objectKey,
      url: completion.url,
    };
  } catch (error) {
    await assetApi.cancelUpload(session.id).catch(() => undefined);
    throw error;
  }
}
