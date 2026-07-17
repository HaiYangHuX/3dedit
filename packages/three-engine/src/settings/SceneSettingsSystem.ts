import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  Color,
  FogExp2,
  GridHelper,
  Group,
  LineBasicMaterial,
  PMREMGenerator,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
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
  fallbackEnvironment?: Texture;
  environmentLoader?: EnvironmentTextureLoader;
  environmentGenerator?: EnvironmentMapGenerator;
}

/** 管理场景级渲染状态、可选编辑网格和 HDR/PMREM 异步资源代次。 */
export class SceneSettingsSystem {
  readonly grid?: Group;
  private readonly fallbackEnvironment?: Texture;
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
      this.grid = this.createEditorGrid();
      this.scene.add(this.grid);
    }
    this.fallbackEnvironment = options.fallbackEnvironment;
    this.environmentLoader = options.environmentLoader ?? new HDRLoader();
    this.environmentGenerator = options.environmentGenerator;
    this.scene.environment = this.fallbackEnvironment ?? null;
  }

  apply(settings: SceneDocument['settings']): void {
    if (this.scene.background instanceof Color) {
      this.scene.background.set(settings.background);
    } else {
      this.scene.background = new Color(settings.background);
    }
    this.renderer.toneMappingExposure = settings.exposure;
    if (this.grid) {
      this.grid.visible = settings.gridVisible;
      if (this.scene.fog instanceof FogExp2) {
        this.scene.fog.color.set(settings.background);
        this.scene.fog.density = 0.01;
      } else {
        // 雾仅用于编辑辅助网格的远端融合，不写入可发布 SceneDocument。
        this.scene.fog = new FogExp2(settings.background, 0.01);
      }
    }
  }

  /** 新 HDR 成功前保留旧环境；迟到纹理和 PMREM target 必须立即释放。 */
  async applyEnvironment(
    assetId: string | null,
    resolver: EnvironmentAssetResolver,
  ): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.environmentGeneration;
    if (!assetId) {
      this.clearEnvironment(this.fallbackEnvironment ?? null);
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
    this.clearEnvironment(null);
    this.environmentGenerator?.dispose();
    this.environmentGenerator = undefined;
    if (!this.grid) return;
    this.scene.fog = null;
    this.grid.removeFromParent();
    for (const child of this.grid.children) {
      if (!(child instanceof GridHelper)) continue;
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) material.dispose();
    }
  }

  /** 复现 ThreeFlowX r183 的细网格 + 主网格，避免使用会参与选择的实体地板。 */
  private createEditorGrid(): Group {
    const group = new Group();
    group.name = '__editor_grid__';
    group.userData.editorHelper = true;
    group.userData.isGridHelper = true;

    const fineGrid = new GridHelper(200, 2_000);
    fineGrid.name = '__editor_grid_fine__';
    fineGrid.userData.editorHelper = true;
    fineGrid.userData.divisions = 2_000;
    const fineMaterial = fineGrid.material as LineBasicMaterial;
    fineMaterial.transparent = true;
    fineMaterial.opacity = 0.1;
    fineMaterial.depthWrite = false;
    fineMaterial.color.setHex(0xaaaaaa);
    fineMaterial.vertexColors = false;
    fineGrid.renderOrder = -1;
    group.add(fineGrid);

    const mainGrid = new GridHelper(200, 200);
    mainGrid.name = '__editor_grid_main__';
    mainGrid.userData.editorHelper = true;
    mainGrid.userData.divisions = 200;
    const mainMaterial = mainGrid.material as LineBasicMaterial;
    mainMaterial.transparent = true;
    mainMaterial.opacity = 0.3;
    mainMaterial.color.setHex(0xffffff);
    mainMaterial.vertexColors = false;
    mainGrid.renderOrder = -1;
    group.add(mainGrid);

    return group;
  }

  private getEnvironmentGenerator(): EnvironmentMapGenerator {
    if (!this.environmentGenerator) {
      const generator = new PMREMGenerator(this.renderer);
      generator.compileEquirectangularShader();
      this.environmentGenerator = generator;
    }
    return this.environmentGenerator;
  }

  private clearEnvironment(nextEnvironment: Texture | null): void {
    this.scene.environment = nextEnvironment;
    this.environmentTarget?.dispose();
    this.environmentTarget = undefined;
  }
}
