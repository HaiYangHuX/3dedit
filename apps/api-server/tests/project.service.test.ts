import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import type { MinioService } from '../src/infrastructure/minio.service.js';
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
    const service = new ProjectService(prisma, {} as MinioService);

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
    const service = new ProjectService(prisma, {} as MinioService);

    await expect(service.list({ keyword: '厂' })).resolves.toEqual([
      expect.objectContaining({ id: 'project-1', sceneCount: 2 }),
    ]);
  });

  it('读取项目和场景时将稳定封面对象键转换为访问地址', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'project-1',
          name: '厂区',
          description: '',
          coverKey: 'covers/projects/project.png',
          createdAt: now,
          updatedAt: now,
          scenes: [
            {
              id: 'scene-1',
              projectId: 'project-1',
              name: '主厂房',
              description: '',
              sortOrder: 0,
              revision: 0,
              contentHash: '',
              document: {},
              coverKey: 'covers/scenes/scene.png',
              createdAt: now,
              updatedAt: now,
            },
          ],
          publication: null,
          _count: { scenes: 1 },
        }),
      },
    } as unknown as PrismaService;
    const minio = {
      presignGet: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(`https://assets.test/${key}`),
        ),
    } as unknown as MinioService;

    const result = await new ProjectService(prisma, minio).get('project-1');

    expect(result.coverKey).toBe(
      'https://assets.test/covers/projects/project.png',
    );
    expect(result.scenes[0]?.coverKey).toBe(
      'https://assets.test/covers/scenes/scene.png',
    );
  });
});
