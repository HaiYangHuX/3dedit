import type {
  MaterialComponent,
  MaterialTextureBinding,
  MaterialTextureSlot,
  TextureWrap,
} from '@digital-twin/scene-schema';
import {
  BackSide,
  ClampToEdgeWrapping,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  type Material,
  type Object3D,
  type Side,
  type Wrapping,
} from 'three';
import type { AssetResolver, TextureAssetFormat } from '../assets/types.js';

export interface TextureLoaderLike {
  loadAsync(url: string): Promise<Texture>;
}

export interface MaterialSystemOptions {
  textureLoader?: TextureLoaderLike;
}

export interface MaterialApplyError {
  slot: MaterialTextureSlot;
  message: string;
}

export interface MaterialApplyReport {
  applied: boolean;
  errors: MaterialApplyError[];
}

interface TextureCacheEntry {
  generation: number;
  promise: Promise<Texture>;
  texture?: Texture;
}

interface MeshSnapshot {
  mesh: Mesh;
  material: Material | Material[];
  castShadow: boolean;
  receiveShadow: boolean;
}

interface RootMaterialEntry {
  snapshots: MeshSnapshot[];
  version: number;
  key?: string;
  material?: Material;
  textures: Set<Texture>;
  report: MaterialApplyReport;
}

const textureFormats = new Set<TextureAssetFormat>([
  'png',
  'jpg',
  'jpeg',
  'webp',
]);

const textureSlots: MaterialTextureSlot[] = [
  'baseColor',
  'normal',
  'roughness',
  'metalness',
  'ao',
  'emissive',
];

export class StaleMaterialLoadError extends Error {
  constructor() {
    super('材质贴图加载结果已过期');
    this.name = 'StaleMaterialLoadError';
  }
}

function sideOf(side: MaterialComponent['side']): Side {
  return {
    front: FrontSide,
    back: BackSide,
    double: DoubleSide,
  }[side];
}

function wrappingOf(wrap: TextureWrap): Wrapping {
  return {
    repeat: RepeatWrapping,
    clamp: ClampToEdgeWrapping,
    mirror: MirroredRepeatWrapping,
  }[wrap];
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '贴图加载失败';
}

function createMaterial(component: MaterialComponent): Material {
  const common = {
    color: component.color,
    opacity: component.opacity,
    transparent: component.transparent || component.opacity < 1,
    wireframe: component.wireframe,
    side: sideOf(component.side),
    depthTest: component.depthTest,
    depthWrite: component.depthWrite,
  };
  switch (component.materialType) {
    case 'physical':
      return new MeshPhysicalMaterial({
        ...common,
        roughness: component.roughness,
        metalness: component.metalness,
        emissive: component.emissive,
        emissiveIntensity: component.emissiveIntensity,
        envMapIntensity: component.envMapIntensity,
        clearcoat: component.clearcoat,
        clearcoatRoughness: component.clearcoatRoughness,
        reflectivity: component.reflectivity,
      });
    case 'phong':
      return new MeshPhongMaterial({
        ...common,
        emissive: component.emissive,
        emissiveIntensity: component.emissiveIntensity,
        specular: component.specular,
        shininess: component.shininess,
        reflectivity: component.reflectivity,
      });
    case 'basic':
      return new MeshBasicMaterial(common);
    case 'standard':
      return new MeshStandardMaterial({
        ...common,
        roughness: component.roughness,
        metalness: component.metalness,
        emissive: component.emissive,
        emissiveIntensity: component.emissiveIntensity,
        envMapIntensity: component.envMapIntensity,
      });
  }
}

function configureTexture(
  texture: Texture,
  binding: MaterialTextureBinding,
  slot: MaterialTextureSlot,
): void {
  texture.offset.fromArray(binding.offset);
  texture.repeat.fromArray(binding.repeat);
  texture.rotation = binding.rotation;
  texture.wrapS = wrappingOf(binding.wrapS);
  texture.wrapT = wrappingOf(binding.wrapT);
  // 外部贴图用于 glTF/Three 材质时遵循 WebGL UV 原点，不能沿用普通图片默认翻转。
  texture.flipY = false;
  texture.colorSpace =
    slot === 'baseColor' || slot === 'emissive' ? SRGBColorSpace : NoColorSpace;
  texture.needsUpdate = true;
}

function assignTexture(
  material: Material,
  slot: MaterialTextureSlot,
  texture: Texture,
): void {
  if (slot === 'baseColor' && 'map' in material) material.map = texture;
  if (slot === 'ao' && 'aoMap' in material) material.aoMap = texture;
  if (
    slot === 'emissive' &&
    (material instanceof MeshStandardMaterial ||
      material instanceof MeshPhongMaterial)
  ) {
    material.emissiveMap = texture;
  }
  if (
    slot === 'normal' &&
    (material instanceof MeshStandardMaterial ||
      material instanceof MeshPhongMaterial)
  ) {
    material.normalMap = texture;
  }
  if (slot === 'roughness' && material instanceof MeshStandardMaterial) {
    material.roughnessMap = texture;
  }
  if (slot === 'metalness' && material instanceof MeshStandardMaterial) {
    material.metalnessMap = texture;
  }
}

function applyScalarTextureParameters(
  material: Material,
  component: MaterialComponent,
): void {
  if (
    material instanceof MeshStandardMaterial ||
    material instanceof MeshPhongMaterial
  ) {
    material.normalScale = new Vector2(...component.normalScale);
    material.aoMapIntensity = component.aoMapIntensity;
  } else if (material instanceof MeshBasicMaterial) {
    material.aoMapIntensity = component.aoMapIntensity;
  }
}

/**
 * 将可序列化材质组件投影到节点子树，并严格区分模型模板共享资源与本系统覆盖资源。
 * 每次场景切换通过 generation 使迟到图片失效，避免旧场景异步结果污染新对象。
 */
export class MaterialSystem {
  private readonly textureLoader: TextureLoaderLike;
  private readonly textureCache = new Map<string, TextureCacheEntry>();
  private readonly roots = new Map<Object3D, RootMaterialEntry>();
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly resolver: AssetResolver,
    options: MaterialSystemOptions = {},
  ) {
    this.textureLoader = options.textureLoader ?? new TextureLoader();
  }

  beginGeneration(): number {
    this.assertAlive();
    this.generation += 1;
    for (const root of [...this.roots.keys()]) this.restore(root);
    this.clearTextureCache();
    return this.generation;
  }

  async apply(
    root: Object3D,
    component: MaterialComponent | undefined,
    generation: number,
  ): Promise<MaterialApplyReport> {
    this.assertCurrent(generation);
    if (!component) {
      this.restore(root);
      return { applied: false, errors: [] };
    }

    const entry = this.ensureRootEntry(root);
    if (entry.snapshots.length === 0) {
      this.roots.delete(root);
      return { applied: false, errors: [] };
    }
    const key = JSON.stringify(component);
    if (entry.key === key && entry.material) return entry.report;
    const version = ++entry.version;
    const material = createMaterial(component);
    const textures = new Set<Texture>();
    const errors: MaterialApplyError[] = [];

    try {
      await Promise.all(
        textureSlots.map(async (slot) => {
          const binding = component.textures[slot];
          if (!binding) return;
          try {
            const template = await this.loadTexture(
              binding.assetId,
              generation,
            );
            this.assertApplyCurrent(root, entry, version, generation);
            const texture = template.clone();
            configureTexture(texture, binding, slot);
            textures.add(texture);
            assignTexture(material, slot, texture);
          } catch (reason) {
            if (reason instanceof StaleMaterialLoadError) throw reason;
            errors.push({ slot, message: errorMessage(reason) });
          }
        }),
      );
      this.assertApplyCurrent(root, entry, version, generation);
    } catch (reason) {
      material.dispose();
      for (const texture of textures) texture.dispose();
      throw reason;
    }

    // 新材质完全就绪后才替换旧覆盖，加载期间视口继续显示上一份有效材质。
    this.releaseOverride(entry);
    applyScalarTextureParameters(material, component);
    material.needsUpdate = true;
    for (const snapshot of entry.snapshots) {
      snapshot.mesh.material = Array.isArray(snapshot.material)
        ? snapshot.material.map(() => material)
        : material;
      snapshot.mesh.castShadow = component.castShadow;
      snapshot.mesh.receiveShadow = component.receiveShadow;
    }
    entry.key = key;
    entry.material = material;
    entry.textures = textures;
    entry.report = { applied: true, errors };
    root.userData.materialErrors = errors;
    return entry.report;
  }

  restore(root: Object3D): void {
    const entry = this.roots.get(root);
    if (!entry) return;
    entry.version += 1;
    this.releaseOverride(entry);
    this.roots.delete(root);
    delete root.userData.materialErrors;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const root of [...this.roots.keys()]) this.restore(root);
    this.disposed = true;
    this.generation += 1;
    this.clearTextureCache();
  }

  private ensureRootEntry(root: Object3D): RootMaterialEntry {
    const existing = this.roots.get(root);
    if (existing) return existing;
    const snapshots: MeshSnapshot[] = [];
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      snapshots.push({
        mesh: object,
        material: object.material,
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
      });
    });
    const entry: RootMaterialEntry = {
      snapshots,
      version: 0,
      textures: new Set(),
      report: { applied: false, errors: [] },
    };
    this.roots.set(root, entry);
    return entry;
  }

  private releaseOverride(entry: RootMaterialEntry): void {
    for (const snapshot of entry.snapshots) {
      snapshot.mesh.material = snapshot.material;
      snapshot.mesh.castShadow = snapshot.castShadow;
      snapshot.mesh.receiveShadow = snapshot.receiveShadow;
    }
    entry.material?.dispose();
    for (const texture of entry.textures) texture.dispose();
    entry.material = undefined;
    entry.textures.clear();
    entry.key = undefined;
  }

  private async loadTexture(
    assetId: string,
    generation: number,
  ): Promise<Texture> {
    const cached = this.textureCache.get(assetId);
    if (cached?.generation === generation) return cached.promise;
    const entry: TextureCacheEntry = {
      generation,
      promise: Promise.resolve(undefined as never),
    };
    entry.promise = this.loadTextureEntry(assetId, entry);
    this.textureCache.set(assetId, entry);
    return entry.promise;
  }

  private async loadTextureEntry(
    assetId: string,
    entry: TextureCacheEntry,
  ): Promise<Texture> {
    try {
      const descriptor = await this.resolver.resolve(assetId);
      if (!textureFormats.has(descriptor.format as TextureAssetFormat)) {
        throw new Error(`资源不是支持的图片贴图: ${descriptor.name}`);
      }
      const texture = await this.textureLoader.loadAsync(descriptor.url);
      if (
        this.disposed ||
        entry.generation !== this.generation ||
        this.textureCache.get(assetId) !== entry
      ) {
        texture.dispose();
        throw new StaleMaterialLoadError();
      }
      entry.texture = texture;
      return texture;
    } catch (reason) {
      if (this.textureCache.get(assetId) === entry) {
        this.textureCache.delete(assetId);
      }
      if (
        reason instanceof StaleMaterialLoadError ||
        this.disposed ||
        entry.generation !== this.generation
      ) {
        throw new StaleMaterialLoadError();
      }
      throw reason;
    }
  }

  private clearTextureCache(): void {
    for (const entry of this.textureCache.values()) entry.texture?.dispose();
    this.textureCache.clear();
  }

  private assertApplyCurrent(
    root: Object3D,
    entry: RootMaterialEntry,
    version: number,
    generation: number,
  ): void {
    this.assertCurrent(generation);
    if (this.roots.get(root) !== entry || entry.version !== version) {
      throw new StaleMaterialLoadError();
    }
  }

  private assertCurrent(generation: number): void {
    this.assertAlive();
    if (generation !== this.generation) throw new StaleMaterialLoadError();
  }

  private assertAlive(): void {
    if (this.disposed) throw new StaleMaterialLoadError();
  }
}
