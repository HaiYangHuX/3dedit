import type { SceneDocument } from './schema.js';

export interface AssetReference {
  assetId: string;
  nodeIds: string[];
}

function addReference(
  references: Map<string, Set<string>>,
  assetId: string,
  nodeId?: string,
): void {
  const nodeIds = references.get(assetId) ?? new Set<string>();
  if (nodeId) nodeIds.add(nodeId);
  references.set(assetId, nodeIds);
}

/**
 * 从真实场景组件重建资源引用。服务端保存、删除保护和发布必须共用该结果，
 * 不能信任客户端可能遗漏或伪造的 assetReferences。
 */
export function collectAssetReferences(
  document: SceneDocument,
): AssetReference[] {
  const references = new Map<string, Set<string>>();
  for (const node of Object.values(document.nodes)) {
    for (const component of node.components) {
      if (component.kind === 'model') {
        addReference(references, component.assetId, node.id);
        continue;
      }
      if (component.kind !== 'material') continue;
      for (const binding of Object.values(component.textures)) {
        if (binding) addReference(references, binding.assetId, node.id);
      }
    }
  }
  if (document.settings.backgroundAssetId) {
    addReference(references, document.settings.backgroundAssetId);
  }
  if (document.settings.environmentAssetId) {
    addReference(references, document.settings.environmentAssetId);
  }
  return [...references.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([assetId, nodeIds]) => ({
      assetId,
      nodeIds: [...nodeIds].sort(),
    }));
}
