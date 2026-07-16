import type { Transform } from '@digital-twin/scene-schema';
import {
  notifyDocumentChanged,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

export interface TransformChange {
  id: string;
  before: Transform;
  after: Transform;
}

function sameTransform(first: Transform, second: Transform): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/** 一次变换可包含多个节点；连续拖动同一集合时合并成单条历史。 */
export class TransformNodesCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '变换节点';
  private readonly changes: TransformChange[];

  constructor(changes: TransformChange[]) {
    this.changes = structuredClone(changes);
  }

  execute(context: EditorDocumentContext): void {
    for (const change of this.changes) {
      if (!context.document.nodes[change.id]) {
        throw new Error(`节点不存在: ${change.id}`);
      }
    }
    for (const change of this.changes) {
      const node = context.document.nodes[change.id];
      if (node) node.transform = structuredClone(change.after);
    }
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    for (const change of this.changes) {
      const node = context.document.nodes[change.id];
      if (node) node.transform = structuredClone(change.before);
    }
    notifyDocumentChanged(context);
  }

  merge(
    next: EditorCommand<EditorDocumentContext>,
  ): EditorCommand<EditorDocumentContext> | undefined {
    if (!(next instanceof TransformNodesCommand)) return undefined;
    if (this.changes.length !== next.changes.length) return undefined;
    const merged: TransformChange[] = [];
    for (let index = 0; index < this.changes.length; index += 1) {
      const previous = this.changes[index];
      const following = next.changes[index];
      if (
        !previous ||
        !following ||
        previous.id !== following.id ||
        !sameTransform(previous.after, following.before)
      ) {
        return undefined;
      }
      merged.push({
        id: previous.id,
        before: previous.before,
        after: following.after,
      });
    }
    return new TransformNodesCommand(merged);
  }
}
