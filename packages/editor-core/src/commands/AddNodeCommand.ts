import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import type { EditorCommand } from './types';

interface DocumentContext {
  document: SceneDocument;
}

/** 新增节点命令同时维护节点字典以及根节点或父节点的子项列表。 */
export class AddNodeCommand implements EditorCommand<DocumentContext> {
  readonly label = '新增节点';

  constructor(private readonly node: SceneNode) {}

  execute(context: DocumentContext): void {
    if (context.document.nodes[this.node.id]) {
      throw new Error(`节点已存在: ${this.node.id}`);
    }
    const parent = this.node.parentId
      ? context.document.nodes[this.node.parentId]
      : undefined;
    if (this.node.parentId && !parent) {
      throw new Error(`父节点不存在: ${this.node.parentId}`);
    }

    // 所有前置条件通过后再修改文档，保证失败命令不会留下半完成节点。
    context.document.nodes[this.node.id] = structuredClone(this.node);
    if (this.node.parentId) {
      parent?.childIds.push(this.node.id);
    } else {
      context.document.rootNodeIds.push(this.node.id);
    }
  }

  undo(context: DocumentContext): void {
    delete context.document.nodes[this.node.id];
    const siblings = this.node.parentId
      ? context.document.nodes[this.node.parentId]?.childIds
      : context.document.rootNodeIds;
    if (!siblings) return;
    const index = siblings.indexOf(this.node.id);
    if (index >= 0) siblings.splice(index, 1);
  }
}
