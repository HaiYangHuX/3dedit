import type { Material, Object3D, Texture } from 'three';

type Disposable = { dispose(): void };

function isDisposable(value: unknown): value is Disposable {
  return typeof value === 'object' && value !== null && 'dispose' in value;
}

function collectObjectResources(
  root: Object3D,
  resources: Set<Disposable>,
): void {
  root.traverse((object) => {
    const candidate = object as Object3D & {
      geometry?: Disposable;
      material?: Material | Material[];
    };
    if (candidate.geometry) resources.add(candidate.geometry);
    const materials = Array.isArray(candidate.material)
      ? candidate.material
      : candidate.material
        ? [candidate.material]
        : [];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if ((value as Texture | undefined)?.isTexture && isDisposable(value)) {
          resources.add(value);
        }
      }
    }
  });
}

/** 立即释放一个独占 Object3D 子树；共享模板实例不能调用该函数。 */
export function disposeObject3D(root: Object3D): void {
  const resources = new Set<Disposable>();
  collectObjectResources(root, resources);
  for (const resource of resources) resource.dispose();
}

/**
 * 记录当前引擎生命周期独占的资源。集合去重保证共享 Geometry、Material、Texture
 * 不会因多个 Mesh 引用而重复释放。
 */
export class ResourceTracker {
  private readonly resources = new Set<Disposable>();

  track(root: Object3D): void {
    collectObjectResources(root, this.resources);
  }

  dispose(): void {
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}
