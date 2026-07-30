import { SHADER_METHODS, type ShaderMethod } from '@digital-twin/scene-schema';
import { Mesh, ShaderMaterial, type Object3D } from 'three';

type ShaderUpdateType = 'uTime' | 'iTime' | 'scale';

interface ShaderEntry {
  mesh: Mesh;
  shaderMethod: ShaderMethod;
  updateType: ShaderUpdateType;
}

const shaderMethods = new Set<string>(SHADER_METHODS);

const uTimeMethods = new Set<ShaderMethod>([
  'CreateWarningShader',
  'CreateWallShader',
  'CreateApertureShader',
  'CreateFlickerWarning',
  'CreateElectronicFence',
  'CreateWarningGuardrail',
  'CreateWarningGuardrailBreath',
  'CreateLogisticsConveyor',
  'CreateHologramBeam',
  'CreateHexTechPlatform',
]);

function readShaderMethod(object: Object3D): ShaderMethod | undefined {
  const value = object.userData.shaderMethod;
  return typeof value === 'string' && shaderMethods.has(value)
    ? (value as ShaderMethod)
    : undefined;
}

/**
 * 复现原站 shaderCache：缓存只持有当前文档 Mesh 引用，不拥有 GPU 资源。
 * geometry/material 的释放仍由 SceneDocumentSystem 统一处理。
 */
export class ShaderSystem {
  private readonly entries = new Map<string, ShaderEntry>();

  get size(): number {
    return this.entries.size;
  }

  /** 文档节点提交后重建轻量缓存，避免每帧 traverse 整个模型场景。 */
  sync(objects: Iterable<Object3D>): void {
    this.entries.clear();
    for (const root of objects) {
      root.traverse((object) => {
        const shaderMethod = readShaderMethod(object);
        if (shaderMethod && object instanceof Mesh) {
          this.register(object, shaderMethod);
        }
      });
    }
  }

  clear(): void {
    this.entries.clear();
  }

  /** 返回 true 表示仍有 Shader 动画，编辑器据此持续置脏。 */
  update(elapsed: number): boolean {
    for (const [key, entry] of this.entries) {
      if (!entry.mesh.parent) {
        this.entries.delete(key);
        continue;
      }
      if (entry.updateType === 'uTime') {
        const material = entry.mesh.material;
        if (material instanceof ShaderMaterial && material.uniforms.uTime) {
          material.uniforms.uTime.value = elapsed;
        }
      } else if (entry.updateType === 'iTime') {
        const material = entry.mesh.material;
        if (material instanceof ShaderMaterial && material.uniforms.iTime) {
          // 原站固定按帧递增，不改成 delta，确保扫描速度与取证版本一致。
          material.uniforms.iTime.value += 0.01;
        }
      } else {
        this.updateScale(entry.mesh);
      }
    }
    return this.entries.size > 0;
  }

  private register(mesh: Mesh, shaderMethod: ShaderMethod): void {
    let updateType: ShaderUpdateType;
    if (uTimeMethods.has(shaderMethod)) {
      updateType = 'uTime';
    } else if (
      shaderMethod === 'CreateRadarShader' ||
      shaderMethod === 'CreateCompassShader'
    ) {
      updateType = 'iTime';
    } else {
      updateType = 'scale';
      this.initializeWarningAperture(mesh);
    }
    this.entries.set(mesh.uuid, { mesh, shaderMethod, updateType });
  }

  /** 源站注册警告光圈时会修复中心原点几何，并同步高度范围 uniforms。 */
  private initializeWarningAperture(mesh: Mesh): void {
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds) return;
    if (bounds.min.y < -0.01 && Math.abs(bounds.min.y + bounds.max.y) < 0.01) {
      mesh.geometry.translate(0, (bounds.max.y - bounds.min.y) / 2, 0);
      mesh.geometry.computeBoundingBox();
    }
    const material = mesh.material;
    const translatedBounds = mesh.geometry.boundingBox;
    if (!(material instanceof ShaderMaterial) || !translatedBounds) return;
    if (material.uniforms.uMax) {
      material.uniforms.uMax.value = translatedBounds.max.clone();
    }
    if (material.uniforms.uMin) {
      material.uniforms.uMin.value = translatedBounds.min.clone();
    }
  }

  private updateScale(mesh: Mesh): void {
    if (!mesh.userData.scaleY) {
      mesh.userData.scaleY = 0.2;
      mesh.userData.scaleDirection = 1;
    }
    mesh.userData.scaleY += mesh.userData.scaleDirection * 0.03;
    if (mesh.userData.scaleY >= 1.4) {
      mesh.userData.scaleY = 1.4;
      mesh.userData.scaleDirection = -1;
    } else if (mesh.userData.scaleY <= 0.2) {
      mesh.userData.scaleY = 0.2;
      mesh.userData.scaleDirection = 1;
    }
    mesh.scale.setY(mesh.userData.scaleY);
  }
}
