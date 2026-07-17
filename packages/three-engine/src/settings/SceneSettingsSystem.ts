import type { SceneDocument, SceneSettings } from '@digital-twin/scene-schema';
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  BasicShadowMap,
  CineonToneMapping,
  Color,
  CustomToneMapping,
  EquirectangularReflectionMapping,
  Fog,
  FogExp2,
  GridHelper,
  Group,
  LinearToneMapping,
  NeutralToneMapping,
  NoColorSpace,
  NoToneMapping,
  PCFShadowMap,
  PCFSoftShadowMap,
  PMREMGenerator,
  ReinhardToneMapping,
  SRGBColorSpace,
  TextureLoader,
  VSMShadowMap,
  type LineBasicMaterial,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import type {
  AssetDescriptor,
  EnvironmentAssetResolver,
} from '../assets/types.js';

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
  /** GroundSystem 接管后仅用于迁移期兼容，Runtime 从不创建此网格。 */
  includeGrid?: boolean;
  fallbackEnvironment?: Texture;
  textureLoader?: EnvironmentTextureLoader;
  environmentLoader?: EnvironmentTextureLoader;
  environmentGenerator?: EnvironmentMapGenerator;
}

const toneMappingByName: Record<
  SceneSettings['toneMapping'],
  WebGLRenderer['toneMapping']
> = {
  custom: CustomToneMapping,
  none: NoToneMapping,
  linear: LinearToneMapping,
  reinhard: ReinhardToneMapping,
  cineon: CineonToneMapping,
  'aces-filmic': ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
};

const shadowMapByName: Record<
  SceneSettings['shadowMapType'],
  WebGLRenderer['shadowMap']['type']
> = {
  // 源站 UI 标注为 NoShadow，但 r183 实际传入 BasicShadowMap 且始终开启 shadowMap。
  basic: BasicShadowMap,
  pcf: PCFShadowMap,
  'pcf-soft': PCFSoftShadowMap,
  vsm: VSMShadowMap,
};

function isEquirectangularAsset(
  descriptor: AssetDescriptor,
): descriptor is AssetDescriptor & {
  format: 'hdr' | 'png' | 'jpg' | 'jpeg' | 'webp';
} {
  return ['hdr', 'png', 'jpg', 'jpeg', 'webp'].includes(descriptor.format);
}

/**
 * 统一管理 renderer、背景、环境和雾。
 * 背景与环境使用独立代次，避免快速切换时迟到资源覆盖新设置。
 */
export class SceneSettingsSystem {
  readonly grid?: Group;
  private readonly fallbackEnvironment?: Texture;
  private readonly textureLoader: EnvironmentTextureLoader;
  private readonly environmentLoader: EnvironmentTextureLoader;
  private environmentGenerator?: EnvironmentMapGenerator;
  private backgroundTexture?: Texture;
  private environmentTarget?: EnvironmentMapTarget;
  private backgroundGeneration = 0;
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
    this.textureLoader = options.textureLoader ?? new TextureLoader();
    this.environmentLoader = options.environmentLoader ?? new HDRLoader();
    this.environmentGenerator = options.environmentGenerator;
    this.scene.environment = this.fallbackEnvironment ?? null;
    this.scene.environmentRotation.set(0, Math.PI / 2, 0);
  }

  apply(settings: SceneDocument['settings']): void {
    this.renderer.toneMapping = toneMappingByName[settings.toneMapping];
    this.renderer.toneMappingExposure = settings.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = shadowMapByName[settings.shadowMapType];
    this.scene.backgroundBlurriness = settings.backgroundBlurriness;
    this.scene.backgroundIntensity = settings.backgroundIntensity;
    this.scene.environmentRotation.set(0, Math.PI / 2, 0);

    if (settings.backgroundType !== 'texture') {
      this.backgroundGeneration += 1;
      this.setSynchronousBackground(settings);
    }
    if (!settings.environmentEnabled) {
      this.environmentGeneration += 1;
      this.clearEnvironment(null);
    } else if (!settings.environmentAssetId && !this.environmentTarget) {
      this.scene.environment = this.fallbackEnvironment ?? null;
    }
    this.applyFog(settings);
    if (this.grid) {
      this.grid.visible =
        settings.gridVisible && settings.groundType === 'grid';
    }
  }

  /** 新背景成功前保留旧画面；颜色/无背景则立即使迟到加载失效。 */
  async applyBackground(
    settings: SceneDocument['settings'],
    resolver: EnvironmentAssetResolver,
  ): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.backgroundGeneration;
    this.scene.backgroundBlurriness = settings.backgroundBlurriness;
    this.scene.backgroundIntensity = settings.backgroundIntensity;
    if (settings.backgroundType !== 'texture') {
      this.setSynchronousBackground(settings);
      return;
    }
    if (!settings.backgroundAssetId) {
      this.replaceBackgroundTexture(undefined);
      this.scene.background = null;
      return;
    }

    const descriptor = await resolver.resolve(settings.backgroundAssetId);
    if (generation !== this.backgroundGeneration || this.disposed) return;
    if (!isEquirectangularAsset(descriptor)) {
      throw new Error(`场景背景资源格式不受支持: ${descriptor.name}`);
    }
    const texture = await this.loadEquirectangularTexture(descriptor);
    if (generation !== this.backgroundGeneration || this.disposed) {
      texture.dispose();
      return;
    }
    texture.mapping = EquirectangularReflectionMapping;
    this.replaceBackgroundTexture(texture);
    this.scene.background = texture;
  }

  /** 环境关闭必须置空；启用且无用户资源时才恢复内置 Venice。 */
  async applyEnvironment(
    settingsOrAssetId: SceneDocument['settings'] | string | null,
    resolver: EnvironmentAssetResolver,
  ): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.environmentGeneration;
    const environmentEnabled =
      typeof settingsOrAssetId === 'object' && settingsOrAssetId !== null
        ? settingsOrAssetId.environmentEnabled
        : true;
    const assetId =
      typeof settingsOrAssetId === 'object' && settingsOrAssetId !== null
        ? settingsOrAssetId.environmentAssetId
        : settingsOrAssetId;
    if (!environmentEnabled) {
      this.clearEnvironment(null);
      return;
    }
    if (!assetId) {
      this.clearEnvironment(this.fallbackEnvironment ?? null);
      return;
    }

    const descriptor = await resolver.resolve(assetId);
    if (generation !== this.environmentGeneration || this.disposed) return;
    if (!isEquirectangularAsset(descriptor)) {
      throw new Error(`场景环境资源格式不受支持: ${descriptor.name}`);
    }
    const sourceTexture = await this.loadEquirectangularTexture(descriptor);
    if (generation !== this.environmentGeneration || this.disposed) {
      sourceTexture.dispose();
      return;
    }

    let nextTarget: EnvironmentMapTarget;
    try {
      sourceTexture.mapping = EquirectangularReflectionMapping;
      nextTarget =
        this.getEnvironmentGenerator().fromEquirectangular(sourceTexture);
    } finally {
      // PMREM 已拥有转换后的 CubeUV target，原始经纬纹理不再由 Scene 引用。
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
    this.backgroundGeneration += 1;
    this.environmentGeneration += 1;
    this.replaceBackgroundTexture(undefined);
    this.scene.background = null;
    this.clearEnvironment(null);
    this.scene.fog = null;
    this.environmentGenerator?.dispose();
    this.environmentGenerator = undefined;
    if (!this.grid) return;
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

  /** 复现 ThreeFlowX r183 的细网格 + 主网格，迁移期后由 GroundSystem 独立持有。 */
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

  private setSynchronousBackground(settings: SceneSettings): void {
    this.replaceBackgroundTexture(undefined);
    const color =
      settings.backgroundType === 'none' ? '#a0a0a0' : settings.background;
    if (this.scene.background instanceof Color) {
      this.scene.background.set(color);
    } else {
      this.scene.background = new Color(color);
    }
  }

  private applyFog(settings: SceneSettings): void {
    if (settings.fogType === 'none') {
      this.scene.fog = null;
      return;
    }
    if (settings.fogType === 'linear') {
      this.scene.fog = new Fog(
        settings.fogColor,
        settings.fogNear,
        settings.fogFar,
      );
      return;
    }
    this.scene.fog = new FogExp2(settings.fogColor, settings.fogDensity);
  }

  private async loadEquirectangularTexture(
    descriptor: AssetDescriptor & {
      format: 'hdr' | 'png' | 'jpg' | 'jpeg' | 'webp';
    },
  ): Promise<Texture> {
    const texture = await (
      descriptor.format === 'hdr' ? this.environmentLoader : this.textureLoader
    ).loadAsync(descriptor.url);
    texture.colorSpace =
      descriptor.format === 'hdr' ? NoColorSpace : SRGBColorSpace;
    return texture;
  }

  private getEnvironmentGenerator(): EnvironmentMapGenerator {
    if (!this.environmentGenerator) {
      const generator = new PMREMGenerator(this.renderer);
      generator.compileEquirectangularShader();
      this.environmentGenerator = generator;
    }
    return this.environmentGenerator;
  }

  private replaceBackgroundTexture(next: Texture | undefined): void {
    if (this.backgroundTexture && this.backgroundTexture !== next) {
      this.backgroundTexture.dispose();
    }
    this.backgroundTexture = next;
  }

  private clearEnvironment(nextEnvironment: Texture | null): void {
    this.scene.environment = nextEnvironment;
    this.environmentTarget?.dispose();
    this.environmentTarget = undefined;
  }
}
