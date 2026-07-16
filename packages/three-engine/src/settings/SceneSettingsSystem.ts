import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  Color,
  GridHelper,
  PMREMGenerator,
  type Material,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import type { EnvironmentAssetResolver } from '../assets/types.js';

export interface EnvironmentTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export interface EnvironmentMapTarget {
  texture: Texture;
  dispose(): void;
}

export interface EnvironmentMapGenerator {
  fromEquirectangular(texture: Texture): EnvironmentMapTarget;
  dispose(): void;
}

export interface SceneSettingsSystemOptions {
  includeGrid?: boolean;
  environmentLoader?: EnvironmentTextureLoader;
  environmentGenerator?: EnvironmentMapGenerator;
}

/** 管理场景级渲染状态、可选编辑网格和 HDR/PMREM 异步资源代次。 */
export class SceneSettingsSystem {
  readonly grid?: GridHelper;
  private readonly environmentLoader: EnvironmentTextureLoader;
  private environmentGenerator?: EnvironmentMapGenerator;
  private environmentTarget?: EnvironmentMapTarget;
  private environmentGeneration = 0;
  private disposed = false;

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
    this.environmentLoader = options.environmentLoader ?? new RGBELoader();
    this.environmentGenerator = options.environmentGenerator;
  }

  apply(settings: SceneDocument['settings']): void {
    if (this.scene.background instanceof Color) {
      this.scene.background.set(settings.background);
    } else {
      this.scene.background = new Color(settings.background);
    }
    this.renderer.toneMappingExposure = settings.exposure;
    if (this.grid) this.grid.visible = settings.gridVisible;
  }

  /** 新 HDR 成功前保留旧环境；迟到纹理和 PMREM target 必须立即释放。 */
  async applyEnvironment(
    assetId: string | null,
    resolver: EnvironmentAssetResolver,
  ): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.environmentGeneration;
    if (!assetId) {
      this.clearEnvironment();
      return;
    }

    const descriptor = await resolver.resolve(assetId);
    if (generation !== this.environmentGeneration || this.disposed) return;
    if (descriptor.format !== 'hdr') {
      throw new Error(`场景环境资源不是 HDR: ${descriptor.name}`);
    }
    const sourceTexture = await this.environmentLoader.loadAsync(
      descriptor.url,
    );
    if (generation !== this.environmentGeneration || this.disposed) {
      sourceTexture.dispose();
      return;
    }

    let nextTarget: EnvironmentMapTarget;
    try {
      nextTarget =
        this.getEnvironmentGenerator().fromEquirectangular(sourceTexture);
    } finally {
      // PMREM 已将经纬纹理转换到独立 RenderTarget，源 HDR 不再由 Scene 使用。
      sourceTexture.dispose();
    }
    if (generation !== this.environmentGeneration || this.disposed) {
      nextTarget.dispose();
      return;
    }
    const previous = this.environmentTarget;
    this.environmentTarget = nextTarget;
    this.scene.environment = nextTarget.texture;
    previous?.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.environmentGeneration += 1;
    this.clearEnvironment();
    this.environmentGenerator?.dispose();
    this.environmentGenerator = undefined;
    if (!this.grid) return;
    this.grid.removeFromParent();
    this.grid.geometry.dispose();
    const materials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];
    for (const material of materials as Material[]) material.dispose();
  }

  private getEnvironmentGenerator(): EnvironmentMapGenerator {
    if (!this.environmentGenerator) {
      const generator = new PMREMGenerator(this.renderer);
      generator.compileEquirectangularShader();
      this.environmentGenerator = generator;
    }
    return this.environmentGenerator;
  }

  private clearEnvironment(): void {
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = undefined;
  }
}
