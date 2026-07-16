import {
  sceneDocumentSchema,
  type SceneDocument,
} from '@digital-twin/scene-schema';
import { createHash } from 'node:crypto';

export interface SceneIdentity {
  id: string;
  projectId: string;
  name: string;
}

/**
 * 服务端从真实组件重建资源引用，防止客户端漏报后资源被误删。
 * 场景身份与 revision 同样由路由和数据库决定，不接受请求文档的自报值。
 */
export function normalizeSceneDocument(
  input: SceneDocument,
  identity: SceneIdentity,
  revision: number,
): SceneDocument {
  const parsed = sceneDocumentSchema.parse(input);
  const references = new Map<string, Set<string>>();

  for (const node of Object.values(parsed.nodes)) {
    for (const component of node.components) {
      if (component.kind !== 'model') continue;
      const nodeIds = references.get(component.assetId) ?? new Set<string>();
      nodeIds.add(node.id);
      references.set(component.assetId, nodeIds);
    }
  }

  if (parsed.settings.environmentAssetId) {
    references.set(
      parsed.settings.environmentAssetId,
      references.get(parsed.settings.environmentAssetId) ?? new Set<string>(),
    );
  }

  return sceneDocumentSchema.parse({
    ...parsed,
    ...identity,
    revision,
    assetReferences: [...references.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([assetId, nodeIds]) => ({
        assetId,
        nodeIds: [...nodeIds].sort(),
      })),
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

/** 递归排序 JSON 键后计算哈希，避免键插入顺序导致伪内容变化。 */
export function hashSceneDocument(document: SceneDocument): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(document)))
    .digest('hex');
}
