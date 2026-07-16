import type { SceneDocument } from '@digital-twin/scene-schema';

/** 所有文档命令共享的最小上下文，不包含 Vue、Pinia 或 Three.js 运行对象。 */
export interface EditorDocumentContext {
  document: SceneDocument;
  onChanged?(): void;
}

/** 服务端仍会重算引用；前端同步维护可让删除保护、状态栏和保存快照即时准确。 */
export function rebuildAssetReferences(document: SceneDocument): void {
  const references = new Map<string, Set<string>>();
  for (const node of Object.values(document.nodes)) {
    for (const component of node.components) {
      if (component.kind !== 'model') continue;
      const nodeIds = references.get(component.assetId) ?? new Set<string>();
      nodeIds.add(node.id);
      references.set(component.assetId, nodeIds);
    }
  }
  if (document.settings.environmentAssetId) {
    references.set(
      document.settings.environmentAssetId,
      references.get(document.settings.environmentAssetId) ?? new Set(),
    );
  }
  document.assetReferences = [...references.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([assetId, nodeIds]) => ({
      assetId,
      nodeIds: [...nodeIds].sort(),
    }));
}

export function notifyDocumentChanged(context: EditorDocumentContext): void {
  rebuildAssetReferences(context.document);
  context.onChanged?.();
}

/** 用快照覆盖同一个文档对象，保证持有该对象引用的 Store 不会失联。 */
export function restoreDocument(
  target: SceneDocument,
  snapshot: SceneDocument,
): void {
  Object.assign(target, structuredClone(snapshot));
}
