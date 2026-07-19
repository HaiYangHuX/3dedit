import {
  createDefaultSceneDocument,
  type SceneDocument,
} from '@digital-twin/scene-schema';
import {
  notifyDocumentChanged,
  restoreDocument,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

/**
 * 将当前场景恢复为默认空场景，同时保留服务端 revision，避免重置后保存发生并发冲突。
 * 重置本身仍是一个历史命令，因此用户可以按原站快捷键 Ctrl/Cmd+Z 恢复重置前的内容。
 */
export class ResetSceneCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '重置场景';
  private before?: SceneDocument;

  execute(context: EditorDocumentContext): void {
    this.before ??= structuredClone(context.document);
    const reset = createDefaultSceneDocument(
      context.document.projectId,
      context.document.id,
      context.document.name,
    );
    reset.revision = context.document.revision;
    restoreDocument(context.document, reset);
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    if (!this.before) return;
    const revision = context.document.revision;
    restoreDocument(context.document, this.before);
    // revision 只由服务端响应推进，撤销本地内容不能回退并发控制版本。
    context.document.revision = revision;
    notifyDocumentChanged(context);
  }
}
