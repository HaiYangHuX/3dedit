import type { SceneNode } from '@digital-twin/scene-schema';
import {
  notifyDocumentChanged,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

export type EditableNodePatch = Partial<
  Pick<
    SceneNode,
    'name' | 'enabled' | 'locked' | 'transform' | 'components' | 'businessData'
  >
>;

/** 更新不影响层级的节点字段；父子调整必须使用 ReparentNodeCommand。 */
export class UpdateNodeCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '更新节点';
  private before?: SceneNode;

  constructor(
    private readonly id: string,
    private readonly patch: EditableNodePatch,
  ) {}

  execute(context: EditorDocumentContext): void {
    const node = context.document.nodes[this.id];
    if (!node) throw new Error(`节点不存在: ${this.id}`);
    this.before ??= structuredClone(node);
    Object.assign(node, structuredClone(this.patch));
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    const node = context.document.nodes[this.id];
    if (!node || !this.before) return;
    Object.assign(node, structuredClone(this.before));
    notifyDocumentChanged(context);
  }
}
