import type { Material, Object3D, Texture } from 'three';

type Disposable = { dispose(): void };

function isDisposable(value: unknown): value is Disposable {
  return typeof value === 'object' && value !== null && 'dispose' in value;
}

/**
 * 记录当前引擎生命周期独占的资源。集合去重保证共享 Geometry、Material、Texture
 * 不会因多个 Mesh 引用而重复释放。
 */
export class ResourceTracker {
  private readonly resources = new Set<Disposable>();

  track(root: Object3D): void {
    root.traverse((object) => {
      const candidate = object as Object3D & {
        geometry?: Disposable;
        material?: Material | Material[];
      };
      if (candidate.geometry) this.resources.add(candidate.geometry);
      const materials = Array.isArray(candidate.material)
        ? candidate.material
        : candidate.material
          ? [candidate.material]
          : [];
      for (const material of materials) this.trackMaterial(material);
    });
  }

  private trackMaterial(material: Material): void {
    this.resources.add(material);
    for (const value of Object.values(material)) {
      if ((value as Texture | undefined)?.isTexture && isDisposable(value)) {
        this.resources.add(value);
      }
    }
  }

  dispose(): void {
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}
