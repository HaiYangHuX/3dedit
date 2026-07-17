import {
  LineSegments,
  Mesh,
  Texture,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

function collectTextures(
  value: unknown,
  result: Set<Texture>,
  depth = 0,
): void {
  if (value instanceof Texture) {
    result.add(value);
    return;
  }
  if (depth >= 2 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) collectTextures(entry, result, depth + 1);
    return;
  }
  for (const entry of Object.values(value)) {
    collectTextures(entry, result, depth + 1);
  }
}

/** 对地面自有几何、材质和纹理去重释放，可安全处理 InstancedMesh 间的共享资源。 */
export function disposeObjectTree(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof LineSegments)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      collectTextures(material, textures);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.removeFromParent();
}
