import type {
  CopyProjectInput,
  CreateProjectInput,
  ListProjectsQuery,
  ProjectDetail,
  ProjectSummary,
  SceneSummary,
  UpdateProjectInput,
} from '@digital-twin/api-contracts';
import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Project, Scene } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../infrastructure/prisma.service.js';

type ProjectPublication = { status?: string; publishedAt: Date } | null;
type ProjectListRow = Project & {
  scenes?: Pick<Scene, 'document'>[];
  publication?: ProjectPublication;
  _count: { scenes: number };
};
type ProjectDetailRow = Project & {
  scenes: Scene[];
  publication: ProjectPublication;
  _count: { scenes: number };
};

/** 项目场景文档中的资源引用不是独立表关系，因此统计时需要按资源 id 去重。 */
function extractAssetIds(scenes: { document: unknown }[] = []): Set<string> {
  const ids = new Set<string>();
  for (const scene of scenes) {
    const document = scene.document;
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
      continue;
    }
    const references = (document as Record<string, unknown>).assetReferences;
    if (!Array.isArray(references)) continue;
    for (const reference of references) {
      if (
        !reference ||
        typeof reference !== 'object' ||
        Array.isArray(reference)
      ) {
        continue;
      }
      const assetId = (reference as Record<string, unknown>).assetId;
      if (typeof assetId === 'string' && assetId.length > 0) ids.add(assetId);
    }
  }
  return ids;
}

function mapSceneSummary(scene: Scene): SceneSummary {
  return {
    id: scene.id,
    projectId: scene.projectId,
    name: scene.name,
    description: scene.description ?? '',
    sortOrder: scene.sortOrder,
    revision: scene.revision,
    contentHash: scene.contentHash,
    coverKey: scene.coverKey,
    createdAt: scene.createdAt.toISOString(),
    updatedAt: scene.updatedAt.toISOString(),
  };
}

function mapProjectSummary(project: ProjectListRow): ProjectSummary {
  const scenes = project.scenes ?? [];
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    code: project.code ?? '',
    status: (project.status ?? 'draft') as ProjectSummary['status'],
    tags: project.tags ?? [],
    ownerName: project.ownerName ?? '平台管理员',
    industry: project.industry ?? '制造业',
    location: project.location ?? '',
    notes: project.notes ?? '',
    coverKey: project.coverKey ?? null,
    sceneCount: project._count.scenes,
    assetCount: extractAssetIds(scenes).size,
    lastPublishedAt: project.publication?.publishedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function mapProjectDetail(project: ProjectDetailRow): ProjectDetail {
  return {
    ...mapProjectSummary(project),
    scenes: project.scenes.map(mapSceneSummary),
    publicationStatus: project.publication?.status ?? null,
  };
}

/** 项目聚合根：项目的创建、复制和删除必须与其场景保持事务一致。 */
@Injectable()
export class ProjectService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: ListProjectsQuery): Promise<ProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      where: query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { code: { contains: query.keyword, mode: 'insensitive' } },
              {
                description: {
                  contains: query.keyword,
                  mode: 'insensitive',
                },
              },
              { tags: { has: query.keyword } },
            ],
          }
        : undefined,
      include: {
        scenes: { select: { document: true } },
        publication: { select: { publishedAt: true } },
        _count: { select: { scenes: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return projects.map(mapProjectSummary);
  }

  async create(input: CreateProjectInput): Promise<ProjectDetail> {
    const projectId = randomUUID();
    const sceneId = randomUUID();
    const result = await this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: { id: projectId, ...input },
      });
      const scene = await transaction.scene.create({
        data: {
          id: sceneId,
          projectId,
          name: '场景一',
          sortOrder: 0,
          revision: 0,
          document: createDefaultSceneDocument(
            projectId,
            sceneId,
            '场景一',
          ) as unknown as Prisma.InputJsonValue,
        },
      });
      return { project, scene };
    });

    return mapProjectDetail({
      ...result.project,
      scenes: [result.scene],
      publication: null,
      _count: { scenes: 1 },
    });
  }

  async get(id: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        scenes: { orderBy: { sortOrder: 'asc' } },
        publication: { select: { status: true, publishedAt: true } },
        _count: { select: { scenes: true } },
      },
    });
    if (!project) throw new NotFoundException('项目不存在');
    return mapProjectDetail(project);
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectDetail> {
    await this.ensureExists(id);
    await this.prisma.project.update({ where: { id }, data: input });
    return this.get(id);
  }

  async copy(id: string, input: CopyProjectInput): Promise<ProjectDetail> {
    const source = await this.prisma.project.findUnique({
      where: { id },
      include: { scenes: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) throw new NotFoundException('项目不存在');

    const projectId = randomUUID();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.project.create({
        data: {
          id: projectId,
          name: input.name ?? `${source.name} 副本`,
          description: source.description,
          code: source.code,
          status: 'draft',
          tags: source.tags,
          ownerName: source.ownerName,
          industry: source.industry,
          location: source.location,
          notes: source.notes,
          coverKey: source.coverKey,
        },
      });
      for (const sourceScene of source.scenes) {
        const sceneId = randomUUID();
        const document = sourceScene.document as Prisma.JsonObject;
        await transaction.scene.create({
          data: {
            id: sceneId,
            projectId,
            name: sourceScene.name,
            sortOrder: sourceScene.sortOrder,
            revision: 0,
            document: {
              ...document,
              id: sceneId,
              projectId,
              revision: 0,
            },
            contentHash: '',
            coverKey: sourceScene.coverKey,
          },
        });
      }
    });
    return this.get(projectId);
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.project.delete({ where: { id } });
  }

  private async ensureExists(id: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('项目不存在');
  }
}
