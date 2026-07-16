import {
  notifyDocumentChanged,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

/** 调整节点父级与顺序，同时拒绝任何会形成层级环的操作。 */
export class ReparentNodeCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '调整节点层级';
  private oldParentId?: string | null;
  private oldIndex?: number;

  constructor(
    private readonly id: string,
    private readonly newParentId: string | null,
    private readonly newIndex: number,
  ) {}

  execute(context: EditorDocumentContext): void {
    const node = context.document.nodes[this.id];
    if (!node) throw new Error(`节点不存在: ${this.id}`);
    if (this.newParentId && !context.document.nodes[this.newParentId]) {
      throw new Error(`父节点不存在: ${this.newParentId}`);
    }
    let ancestorId = this.newParentId;
    while (ancestorId) {
      if (ancestorId === this.id) throw new Error('不能把节点移动到自身后代');
      ancestorId = context.document.nodes[ancestorId]?.parentId ?? null;
    }

    if (this.oldIndex === undefined) {
      this.oldParentId = node.parentId;
      this.oldIndex = this.siblings(context, node.parentId).indexOf(this.id);
    }
    this.move(context, this.newParentId, this.newIndex);
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    if (this.oldIndex === undefined || this.oldParentId === undefined) return;
    this.move(context, this.oldParentId, this.oldIndex);
    notifyDocumentChanged(context);
  }

  private move(
    context: EditorDocumentContext,
    parentId: string | null,
    index: number,
  ): void {
    const node = context.document.nodes[this.id];
    if (!node) return;
    const current = this.siblings(context, node.parentId);
    const currentIndex = current.indexOf(this.id);
    if (currentIndex >= 0) current.splice(currentIndex, 1);
    const next = this.siblings(context, parentId);
    next.splice(Math.max(0, Math.min(index, next.length)), 0, this.id);
    node.parentId = parentId;
  }

  private siblings(
    context: EditorDocumentContext,
    parentId: string | null,
  ): string[] {
    return parentId
      ? (context.document.nodes[parentId]?.childIds ?? [])
      : context.document.rootNodeIds;
  }
}
