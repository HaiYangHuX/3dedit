import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { ProjectService } from '../src/projects/project.service.js';

const now = new Date('2026-07-16T06:00:00.000Z');

describe('ProjectService', () => {
  it('在同一事务中创建项目和默认场景', async () => {
    const transaction = {
      project: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          coverKey: null,
          createdAt: now,
          updatedAt: now,
        })),
      },
      scene: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          coverKey: null,
          contentHash: '',
          createdAt: now,
          updatedAt: now,
        })),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new ProjectService(prisma);

    const result = await service.create({
      name: '化工厂',
      description: '三维厂区',
    });

    expect(transaction.project.create).toHaveBeenCalledTimes(1);
    expect(transaction.scene.create).toHaveBeenCalledTimes(1);
    const sceneData = transaction.scene.create.mock.calls[0]?.[0].data;
    const projectData = transaction.project.create.mock.calls[0]?.[0].data;
    expect(sceneData?.projectId).toBe(projectData?.id);
    expect(sceneData?.document).toEqual(
      createDefaultSceneDocument(
        String(projectData?.id),
        String(sceneData?.id),
        '场景一',
      ),
    );
    expect(result.sceneCount).toBe(1);
    expect(result.scenes).toHaveLength(1);
  });

  it('将数据库场景计数映射为项目列表契约', async () => {
    const prisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'project-1',
            name: '厂区',
            description: '',
            coverKey: null,
            createdAt: now,
            updatedAt: now,
            _count: { scenes: 2 },
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ProjectService(prisma);

    await expect(service.list({ keyword: '厂' })).resolves.toEqual([
      expect.objectContaining({ id: 'project-1', sceneCount: 2 }),
    ]);
  });
});
