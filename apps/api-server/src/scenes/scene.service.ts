import type {
  CopySceneInput,
  CreateSceneInput,
  ReorderScenesInput,
  SaveSceneInput,
  SceneDetail,
  SceneSummary,
  UpdateSceneInput,
} from '@digital-twin/api-contracts';
import {
  createDefaultSceneDocument,
  sceneDocumentSchema,
} from '@digital-twin/scene-schema';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Scene } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { hashSceneDocument, normalizeSceneDocument } from './scene-document.js';

function mapSceneSummary(scene: Scene): SceneSummary {
  return {
    id: scene.id,
    projectId: scene.projectId,
    name: scene.name,
    sortOrder: scene.sortOrder,
    revision: scene.revision,
    contentHash: scene.contentHash,
    coverKey: scene.coverKey,
    createdAt: scene.createdAt.toISOString(),
    updatedAt: scene.updatedAt.toISOString(),
  };
}

function mapSceneDetail(scene: Scene): SceneDetail {
  return {
    ...mapSceneSummary(scene),
    document: sceneDocumentSchema.parse(scene.document),
  };
}

function toJson(document: ReturnType<typeof normalizeSceneDocument>) {
  return document as unknown as Prisma.InputJsonValue;
}

/** 管理多场景顺序、文档身份与乐观并发保存。 */
@Injectable()
export class SceneService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(id: string): Promise<SceneDetail> {
    const scene = await this.prisma.scene.findUnique({ where: { id } });
    if (!scene) throw new NotFoundException('场景不存在');
    return mapSceneDetail(scene);
  }

  async create(
    projectId: string,
    input: CreateSceneInput,
  ): Promise<SceneDetail> {
    const sceneId = randomUUID();
    const scene = await this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('项目不存在');
      const aggregate = await transaction.scene.aggregate({
        where: { projectId },
        _max: { sortOrder: true },
      });
      return transaction.scene.create({
        data: {
          id: sceneId,
          projectId,
          name: input.name,
          sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
          document: createDefaultSceneDocument(
            projectId,
            sceneId,
            input.name,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return mapSceneDetail(scene);
  }

  async update(id: string, input: UpdateSceneInput): Promise<SceneDetail> {
    const current = await this.requireScene(id);
    const name = input.name ?? current.name;
    const document = normalizeSceneDocument(
      sceneDocumentSchema.parse(current.document),
      { id, projectId: current.projectId, name },
      current.revision,
    );
    const scene = await this.prisma.scene.update({
      where: { id },
      data: {
        ...input,
        name,
        document: toJson(document),
        contentHash: hashSceneDocument(document),
      },
    });
    return mapSceneDetail(scene);
  }

  async copy(id: string, input: CopySceneInput): Promise<SceneDetail> {
    const source = await this.requireScene(id);
    const sceneId = randomUUID();
    const name = input.name ?? `${source.name} 副本`;
    const document = normalizeSceneDocument(
      sceneDocumentSchema.parse(source.document),
      { id: sceneId, projectId: source.projectId, name },
      0,
    );
    const scene = await this.prisma.$transaction(async (transaction) => {
      const aggregate = await transaction.scene.aggregate({
        where: { projectId: source.projectId },
        _max: { sortOrder: true },
      });
      return transaction.scene.create({
        data: {
          id: sceneId,
          projectId: source.projectId,
          name,
          sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
          revision: 0,
          document: toJson(document),
          contentHash: hashSceneDocument(document),
          coverKey: source.coverKey,
        },
      });
    });
    return mapSceneDetail(scene);
  }

  async reorder(
    projectId: string,
    input: ReorderScenesInput,
  ): Promise<SceneSummary[]> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.scene.findMany({
        where: { projectId },
        select: { id: true },
      });
      const existingIds = existing.map(({ id }) => id).sort();
      const requestedIds = [...input.sceneIds].sort();
      if (JSON.stringify(existingIds) !== JSON.stringify(requestedIds)) {
        throw new BadRequestException('排序必须包含项目的全部场景');
      }
      await Promise.all(
        input.sceneIds.map((id, sortOrder) =>
          transaction.scene.update({ where: { id }, data: { sortOrder } }),
        ),
      );
      const scenes = await transaction.scene.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
      });
      return scenes.map(mapSceneSummary);
    });
  }

  async save(id: string, input: SaveSceneInput): Promise<SceneDetail> {
    if (input.document.revision !== input.baseRevision) {
      throw new BadRequestException('文档 revision 必须与 baseRevision 一致');
    }
    const current = await this.requireScene(id);
    const nextRevision = input.baseRevision + 1;
    const document = normalizeSceneDocument(
      input.document,
      { id, projectId: current.projectId, name: current.name },
      nextRevision,
    );
    const result = await this.prisma.scene.updateMany({
      where: { id, revision: input.baseRevision },
      data: {
        revision: nextRevision,
        document: toJson(document),
        contentHash: hashSceneDocument(document),
      },
    });
    if (result.count === 0) {
      const exists = await this.prisma.scene.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('场景不存在');
      throw new ConflictException({
        code: 'REVISION_CONFLICT',
        message: '场景已被其他窗口修改，请重新加载',
      });
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const scene = await transaction.scene.findUnique({ where: { id } });
        if (!scene) throw new NotFoundException('场景不存在');
        const count = await transaction.scene.count({
          where: { projectId: scene.projectId },
        });
        if (count <= 1) {
          throw new ConflictException({
            code: 'LAST_SCENE_REQUIRED',
            message: '项目至少需要保留一个场景',
          });
        }
        await transaction.scene.delete({ where: { id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireScene(id: string): Promise<Scene> {
    const scene = await this.prisma.scene.findUnique({ where: { id } });
    if (!scene) throw new NotFoundException('场景不存在');
    return scene;
  }
}
