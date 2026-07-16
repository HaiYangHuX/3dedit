import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  notifyDocumentChanged,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

export type RuntimeConfigPatch = Partial<
  Pick<SceneDocument, 'interactions' | 'dataSources' | 'socketTasks'>
>;

/** 多个运行时区段可在一个历史命令中提交，删除数据源与关联任务不会被分开撤销。 */
export class UpdateRuntimeConfigCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '更新运行时配置';
  private before?: RuntimeConfigPatch;

  constructor(private readonly patch: RuntimeConfigPatch) {
    if (Object.keys(patch).length === 0) {
      throw new Error('运行时配置补丁不能为空');
    }
  }

  execute(context: EditorDocumentContext): void {
    this.before ??= Object.fromEntries(
      Object.keys(this.patch).map((key) => [
        key,
        structuredClone(context.document[key as keyof RuntimeConfigPatch]),
      ]),
    ) as RuntimeConfigPatch;
    Object.assign(context.document, structuredClone(this.patch));
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    if (!this.before) return;
    Object.assign(context.document, structuredClone(this.before));
    notifyDocumentChanged(context);
  }
}
