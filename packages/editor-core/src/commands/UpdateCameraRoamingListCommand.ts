import type { CameraRoamingPath } from '@digital-twin/scene-schema';
import {
  notifyDocumentChanged,
  type EditorDocumentContext,
} from '../context/EditorDocumentContext.js';
import type { EditorCommand } from './types.js';

/** 路径新增、删除和重排均以完整列表快照提交，避免数组下标命令互相覆盖。 */
export class UpdateCameraRoamingListCommand implements EditorCommand<EditorDocumentContext> {
  readonly label = '更新相机漫游路径';
  private before?: CameraRoamingPath[];
  private readonly after: CameraRoamingPath[];

  constructor(paths: readonly CameraRoamingPath[]) {
    this.after = paths.map((path) => structuredClone(path));
  }

  execute(context: EditorDocumentContext): void {
    this.before ??= structuredClone(context.document.cameraRoamingList);
    context.document.cameraRoamingList = structuredClone(this.after);
    notifyDocumentChanged(context);
  }

  undo(context: EditorDocumentContext): void {
    if (!this.before) return;
    context.document.cameraRoamingList = structuredClone(this.before);
    notifyDocumentChanged(context);
  }
}
