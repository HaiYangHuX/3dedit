import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { describe, expect, it } from 'vitest';
import {
  analyzeAssetJobDataSchema,
  completeUploadInputSchema,
  createProjectInputSchema,
  createSceneInputSchema,
  createUploadInputSchema,
  reorderScenesInputSchema,
  saveSceneInputSchema,
  uploadCompletionSchema,
  updateProjectInputSchema,
} from '../src/index.js';

describe('项目与场景 API 契约', () => {
  it('清理名称并拒绝空项目名', () => {
    expect(createProjectInputSchema.parse({ name: '  化工厂  ' })).toEqual({
      name: '化工厂',
      description: '',
    });
    expect(() => createProjectInputSchema.parse({ name: '   ' })).toThrow();
    expect(() => updateProjectInputSchema.parse({})).toThrow();
  });

  it('验证场景名称与不重复的排序 ID', () => {
    expect(createSceneInputSchema.parse({ name: '  厂区  ' })).toEqual({
      name: '厂区',
    });
    expect(() =>
      reorderScenesInputSchema.parse({ sceneIds: ['scene-1', 'scene-1'] }),
    ).toThrow();
  });

  it('使用真实场景协议验证保存请求', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );

    expect(saveSceneInputSchema.parse({ baseRevision: 0, document })).toEqual({
      baseRevision: 0,
      document,
    });
    expect(() =>
      saveSceneInputSchema.parse({ baseRevision: -1, document }),
    ).toThrow();
  });
});

describe('资源上传 API 契约', () => {
  const sha256 = 'a'.repeat(64);

  it('从文件扩展名归一化资源格式与类型', () => {
    expect(
      createUploadInputSchema.parse({
        fileName: 'Pump.GLB',
        size: 6_000_000,
        sha256,
        mimeType: 'model/gltf-binary',
      }),
    ).toMatchObject({ format: 'glb', kind: 'model' });
    expect(() =>
      createUploadInputSchema.parse({
        fileName: 'virus.exe',
        size: 1,
        sha256,
        mimeType: 'application/octet-stream',
      }),
    ).toThrow();
  });

  it('拒绝重复的 multipart partNumber', () => {
    expect(
      completeUploadInputSchema.parse({
        parts: [{ partNumber: 1, etag: 'etag-1' }],
      }),
    ).toBeDefined();
    expect(() =>
      completeUploadInputSchema.parse({
        parts: [
          { partNumber: 1, etag: 'etag-1' },
          { partNumber: 1, etag: 'etag-2' },
        ],
      }),
    ).toThrow();
  });

  it('约束上传完成后的任务回执', () => {
    expect(
      uploadCompletionSchema.parse({
        assetId: 'asset-1',
        fileId: 'file-1',
        jobId: 'job-1',
        status: 'queued',
      }),
    ).toMatchObject({ assetId: 'asset-1', status: 'queued' });
    expect(
      analyzeAssetJobDataSchema.parse({
        assetId: 'asset-1',
        fileId: 'file-1',
        objectKey: 'assets/asset-1/source/pump.glb',
        expectedSha256: sha256,
      }),
    ).toMatchObject({ fileId: 'file-1', expectedSha256: sha256 });
  });
});
