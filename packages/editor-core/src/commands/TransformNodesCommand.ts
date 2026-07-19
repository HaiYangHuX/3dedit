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

/** 一次变换可包含多个节点；每次鼠标松开都会形成独立历史步骤。 */
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
}
