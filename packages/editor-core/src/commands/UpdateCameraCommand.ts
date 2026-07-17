import type { SceneCamera } from '@digital-twin/scene-schema';
import {
  notifyDocumentChanged,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

export type EditableCameraPatch = Partial<SceneCamera>;

/** 活动 Camera 不是 SceneNode，但仍必须进入同一撤销、脏状态和自动保存边界。 */
export class UpdateCameraCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '更新相机';
  private before?: SceneCamera;
  private readonly patch: EditableCameraPatch;

  constructor(patch: EditableCameraPatch) {
    if (Object.keys(patch).length === 0) {
      throw new Error('相机补丁不能为空');
    }
    this.patch = structuredClone(patch);
  }

  execute(context: EditorDocumentContext): void {
    this.before ??= structuredClone(context.document.camera);
    Object.assign(context.document.camera, structuredClone(this.patch));
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    if (!this.before) return;
    Object.assign(context.document.camera, structuredClone(this.before));
    notifyDocumentChanged(context);
  }
}
