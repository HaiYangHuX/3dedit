import {
  collectAssetReferences,
  type SceneDocument,
} from '@digital-twin/scene-schema';

/** 所有文档命令共享的最小上下文，不包含 Vue、Pinia 或 Three.js 运行对象。 */
export interface EditorDocumentContext {
  document: SceneDocument;
  onChanged?(): void;
}

/** 服务端仍会重算引用；前端同步维护可让删除保护、状态栏和保存快照即时准确。 */
export function rebuildAssetReferences(document: SceneDocument): void {
  document.assetReferences = collectAssetReferences(document);
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
