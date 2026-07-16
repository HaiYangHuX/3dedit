import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { SceneService } from '../src/scenes/scene.service.js';

const now = new Date('2026-07-16T06:00:00.000Z');
const sceneRow = {
  id: 'scene-1',
  projectId: 'project-1',
  name: '场景一',
  sortOrder: 0,
  revision: 3,
  document: createDefaultSceneDocument('project-1', 'scene-1', '场景一'),
  contentHash: '',
  coverKey: null,
  createdAt: now,
  updatedAt: now,
};

describe('SceneService', () => {
  it('使用 id 和 baseRevision 执行原子保存', async () => {
    const prisma = {
      scene: {
        findUnique: vi.fn().mockResolvedValue(sceneRow),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const service = new SceneService(prisma);
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );
    document.revision = 3;

    await service.save('scene-1', { baseRevision: 3, document });

    expect(prisma.scene.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'scene-1', revision: 3 },
        data: expect.objectContaining({ revision: 4 }),
      }),
    );
  });

  it('条件更新失败且场景存在时返回冲突', async () => {
    const prisma = {
      scene: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(sceneRow)
          .mockResolvedValueOnce({ id: 'scene-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;
    const service = new SceneService(prisma);
    const staleDocument = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );
    staleDocument.revision = 2;

    await expect(
      service.save('scene-1', {
        baseRevision: 2,
        document: staleDocument,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('拒绝删除项目的最后一个场景', async () => {
    const transaction = {
      scene: {
        findUnique: vi.fn().mockResolvedValue(sceneRow),
        count: vi.fn().mockResolvedValue(1),
        delete: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new SceneService(prisma);

    await expect(service.remove('scene-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.scene.delete).not.toHaveBeenCalled();
  });
});
