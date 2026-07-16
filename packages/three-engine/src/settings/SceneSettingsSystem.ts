import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  Color,
  GridHelper,
  type Material,
  type Scene,
  type WebGLRenderer,
} from 'three';

/** 管理不属于业务节点的场景级渲染状态和编辑器网格。 */
export class SceneSettingsSystem {
  readonly grid = new GridHelper(100, 100, '#334155', '#1e293b');

  constructor(
    private readonly scene: Scene,
    private readonly renderer: WebGLRenderer,
  ) {
    this.grid.name = '__editor_grid__';
    this.grid.userData.editorHelper = true;
    this.grid.position.y = 0;
    this.scene.add(this.grid);
  }

  apply(settings: SceneDocument['settings']): void {
    if (this.scene.background instanceof Color) {
      this.scene.background.set(settings.background);
    } else {
      this.scene.background = new Color(settings.background);
    }
    this.renderer.toneMappingExposure = settings.exposure;
    this.grid.visible = settings.gridVisible;
    // environmentAssetId 需要 HDR/PMREM 的独立异步代次，不在同步设置边界内偷偷发起加载。
  }

  dispose(): void {
    this.grid.removeFromParent();
    this.grid.geometry.dispose();
    const materials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];
    for (const material of materials as Material[]) material.dispose();
  }
}
