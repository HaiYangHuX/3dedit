import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  Color,
  GridHelper,
  type Material,
  type Scene,
  type WebGLRenderer,
} from 'three';

export interface SceneSettingsSystemOptions {
  includeGrid?: boolean;
}

/** 管理场景级渲染状态；编辑器可选网格不会进入纯运行时实例。 */
export class SceneSettingsSystem {
  readonly grid?: GridHelper;

  constructor(
    private readonly scene: Scene,
    private readonly renderer: WebGLRenderer,
    options: SceneSettingsSystemOptions = {},
  ) {
    if (options.includeGrid !== false) {
      const grid = new GridHelper(100, 100, '#334155', '#1e293b');
      grid.name = '__editor_grid__';
      grid.userData.editorHelper = true;
      grid.position.y = 0;
      this.grid = grid;
      this.scene.add(grid);
    }
  }

  apply(settings: SceneDocument['settings']): void {
    if (this.scene.background instanceof Color) {
      this.scene.background.set(settings.background);
    } else {
      this.scene.background = new Color(settings.background);
    }
    this.renderer.toneMappingExposure = settings.exposure;
    if (this.grid) this.grid.visible = settings.gridVisible;
    // environmentAssetId 需要 HDR/PMREM 的独立异步代次，不在同步设置边界内偷偷发起加载。
  }

  dispose(): void {
    if (!this.grid) return;
    this.grid.removeFromParent();
    this.grid.geometry.dispose();
    const materials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];
    for (const material of materials as Material[]) material.dispose();
  }
}
