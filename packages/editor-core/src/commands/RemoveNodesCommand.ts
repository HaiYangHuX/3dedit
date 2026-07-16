import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  notifyDocumentChanged,
  restoreDocument,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

function collectSubtree(
  document: SceneDocument,
  id: string,
  collected: Set<string>,
): void {
  if (collected.has(id)) return;
  const node = document.nodes[id];
  if (!node) return;
  collected.add(id);
  for (const childId of node.childIds)
    collectSubtree(document, childId, collected);
}

function referencesNode(value: unknown, removed: Set<string>): boolean {
  if (Array.isArray(value))
    return value.some((child) => referencesNode(child, removed));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => {
    if (
      ['nodeId', 'sourceNodeId', 'targetNodeId'].includes(key) &&
      typeof child === 'string'
    ) {
      return removed.has(child);
    }
    return referencesNode(child, removed);
  });
}

/** 删除选中节点的完整子树，并同步清理所有明确指向这些节点的业务配置。 */
export class RemoveNodesCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '删除节点';
  private before?: SceneDocument;

  constructor(private readonly ids: string[]) {}

  execute(context: EditorDocumentContext): void {
    const document = context.document;
    const removed = new Set<string>();
    for (const id of this.ids) collectSubtree(document, id, removed);
    if (removed.size === 0) throw new Error('没有可删除的节点');
    this.before ??= structuredClone(document);

    for (const id of removed) delete document.nodes[id];
    document.rootNodeIds = document.rootNodeIds.filter(
      (id) => !removed.has(id),
    );
    for (const node of Object.values(document.nodes)) {
      node.childIds = node.childIds.filter((id) => !removed.has(id));
    }
    document.interactions = document.interactions.filter(
      (interaction) => !referencesNode(interaction, removed),
    );
    document.socketTasks = document.socketTasks.filter(
      (task) => !removed.has(task.targetNodeId),
    );
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    if (!this.before) return;
    restoreDocument(context.document, this.before);
    context.onChanged?.();
  }
}
