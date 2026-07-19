import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  notifyDocumentChanged,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

export type EditableSceneSettingsPatch = Partial<SceneDocument['settings']>;

/** 场景级配置与节点命令共用同一历史游标和显式保存边界。 */
export class UpdateSceneSettingsCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '更新场景设置';
  private before?: SceneDocument['settings'];

  constructor(private readonly patch: EditableSceneSettingsPatch) {}

  execute(context: EditorDocumentContext): void {
    this.before ??= structuredClone(context.document.settings);
    Object.assign(context.document.settings, structuredClone(this.patch));
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    if (!this.before) return;
    Object.assign(context.document.settings, structuredClone(this.before));
    notifyDocumentChanged(context);
  }
}
