import { BoxHelper, type Object3D, type Scene } from 'three';
import type { SelectionHighlightTarget } from './SelectionSystem.js';

/**
 * 使用源站同款黄色包围盒表达编辑选择，不通过后处理覆盖模型材质像素。
 * 该系统独占所有 BoxHelper 的 geometry/material，并负责幂等释放。
 */
export class SelectionBoxSystem implements SelectionHighlightTarget {
  private readonly objects: Object3D[] = [];
  private readonly helpers: BoxHelper[] = [];
  private disposed = false;

  constructor(private readonly scene: Scene) {}

  setObjects(objects: Object3D[]): void {
    if (this.disposed) return;
    const uniqueObjects = [...new Set(objects)];
    const unchanged =
      uniqueObjects.length === this.objects.length &&
      uniqueObjects.every((object, index) => object === this.objects[index]);
    if (unchanged) {
      this.update();
      return;
    }

    this.clear();
    this.objects.push(...uniqueObjects);
    for (const object of uniqueObjects) {
      const helper = new BoxHelper(object, 0xffff00);
      helper.name = '__editor_selection_box__';
      helper.userData.editorHelper = true;
      helper.userData.isSelectionHelper = true;
      this.helpers.push(helper);
      this.scene.add(helper);
    }
  }

  /** 在实际绘制前同步世界包围盒，确保属性面板与 TransformControls 变换即时生效。 */
  update(): void {
    for (const helper of this.helpers) helper.update();
  }

  clear(): void {
    for (const helper of this.helpers) {
      helper.removeFromParent();
      helper.dispose();
    }
    this.helpers.length = 0;
    this.objects.length = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }
}
