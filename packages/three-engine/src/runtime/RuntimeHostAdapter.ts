import type {
  AnimationAction,
  RuntimeHost,
  RuntimeNodeEvent,
  RuntimeTransition,
  VideoAction,
} from '@digital-twin/runtime-core';
import type { Transform } from '@digital-twin/scene-schema';
import {
  AnimationMixer,
  Box3,
  LoopOnce,
  LoopRepeat,
  Mesh,
  Sphere,
  Vector3,
  type AnimationAction as ThreeAnimationAction,
  type AnimationClip,
  type Color,
  type Material,
  type Object3D,
  type PerspectiveCamera,
} from 'three';

export interface RuntimeCameraControls {
  target: Vector3;
  update(): void;
}

export interface RuntimeOutlineTarget {
  selectedObjects: Object3D[];
}

export interface RuntimeHostAdapterOptions {
  getObject(nodeId: string): Object3D | undefined;
  camera: PerspectiveCamera;
  controls?: RuntimeCameraControls;
  outline: RuntimeOutlineTarget;
  subscribeNodeEvent(
    nodeId: string,
    event: RuntimeNodeEvent,
    listener: () => void,
  ): () => void;
  /** 宿主在 Camera tween 前释放第一人称、漫游等互斥的写入模式。 */
  beforeCameraChange?: () => void;
  invalidate?: () => void;
  onSwitchScene?: (sceneId: string) => void | Promise<void>;
  onOpenLink?: (
    url: string,
    target: '_self' | '_blank',
  ) => void | Promise<void>;
  onOpenPopup?: (name: string, payload?: unknown) => void | Promise<void>;
}

interface ActiveTween {
  frameId: number;
  cancel(): void;
}

interface MixerEntry {
  root: Object3D;
  mixer: AnimationMixer;
  actions: Map<string, ThreeAnimationAction>;
}

type ColorMaterial = Material & { color?: Color };

function eased(progress: number, easing: RuntimeTransition['easing']): number {
  switch (easing) {
    case 'ease-in':
      return progress * progress;
    case 'ease-out':
      return 1 - (1 - progress) ** 2;
    case 'ease-in-out':
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - (-2 * progress + 2) ** 2 / 2;
    default:
      return progress;
  }
}

/** 把框架无关 RuntimeHost 动作映射为当前场景中的 Three.js 对象操作。 */
export class RuntimeHostAdapter implements RuntimeHost {
  private readonly highlighted = new Set<string>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly originalMaterials = new Map<Mesh, Material | Material[]>();
  private readonly tweens = new Map<string, ActiveTween>();
  private readonly mixers = new Map<string, MixerEntry>();
  private disposed = false;

  constructor(private readonly options: RuntimeHostAdapterOptions) {}

  isNodeVisible(nodeId: string): boolean {
    let object: Object3D | null | undefined = this.options.getObject(nodeId);
    if (!object) return false;
    while (object) {
      if (!object.visible) return false;
      object = object.parent;
    }
    return true;
  }

  setVisibility(nodeId: string, visible: boolean): void {
    this.requireObject(nodeId).visible = visible;
    this.options.invalidate?.();
  }

  async setTransform(
    nodeId: string,
    transform: Partial<Transform>,
    transition: RuntimeTransition = {},
    signal?: AbortSignal,
  ): Promise<void> {
    const object = this.requireObject(nodeId);
    const from = {
      position: object.position.toArray(),
      rotation: object.rotation.toArray().slice(0, 3) as [
        number,
        number,
        number,
      ],
      scale: object.scale.toArray(),
    };
    await this.tween(`transform:${nodeId}`, transition, signal, (progress) => {
      if (transform.position) {
        object.position.fromArray(
          from.position.map(
            (value, index) =>
              value + (transform.position![index]! - value) * progress,
          ) as [number, number, number],
        );
      }
      if (transform.rotation) {
        object.rotation.set(
          ...(from.rotation.map(
            (value, index) =>
              value + (transform.rotation![index]! - value) * progress,
          ) as [number, number, number]),
        );
      }
      if (transform.scale) {
        object.scale.fromArray(
          from.scale.map(
            (value, index) =>
              value + (transform.scale![index]! - value) * progress,
          ) as [number, number, number],
        );
      }
      object.updateMatrixWorld(true);
      this.options.invalidate?.();
    });
  }

  setColor(nodeId: string, color: string): void {
    const root = this.requireObject(nodeId);
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (!this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, object.material);
      }
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const owned = materials.map((material) => {
        if (this.ownedMaterials.has(material)) return material;
        const clone = material.clone();
        this.ownedMaterials.add(clone);
        return clone;
      });
      for (const material of owned as ColorMaterial[]) {
        if (material.color) material.color.set(color);
        else material.userData.runtimeColor = color;
        material.needsUpdate = true;
      }
      object.material = Array.isArray(object.material) ? owned : owned[0]!;
    });
    this.options.invalidate?.();
  }

  setHighlight(nodeId: string, highlighted: boolean): void {
    if (highlighted) this.highlighted.add(nodeId);
    else this.highlighted.delete(nodeId);
    this.options.outline.selectedObjects = [...this.highlighted].flatMap(
      (id) => {
        const object = this.options.getObject(id);
        return object ? [object] : [];
      },
    );
    this.options.invalidate?.();
  }

  async focusNode(
    nodeId: string,
    transition: RuntimeTransition = {},
    signal?: AbortSignal,
  ): Promise<void> {
    const object = this.requireObject(nodeId);
    this.options.beforeCameraChange?.();
    object.updateWorldMatrix(true, true);
    const bounds = new Box3().expandByObject(object, true);
    const sphere = new Sphere();
    if (bounds.isEmpty()) {
      object.getWorldPosition(sphere.center);
      sphere.radius = 0.5;
    } else bounds.getBoundingSphere(sphere);
    const currentTarget =
      this.options.controls?.target.clone() ?? new Vector3();
    const direction = this.options.camera.position
      .clone()
      .sub(currentTarget)
      .normalize();
    if (direction.lengthSq() === 0) direction.set(1, 0.6, 1).normalize();
    const halfFov = (this.options.camera.fov * Math.PI) / 360;
    const distance = Math.max(
      sphere.radius / Math.max(Math.sin(halfFov), 0.1),
      2,
    );
    const startPosition = this.options.camera.position.clone();
    const endPosition = sphere.center
      .clone()
      .add(direction.multiplyScalar(distance * 1.25));
    await this.tween('camera', transition, signal, (progress) => {
      this.options.camera.position.lerpVectors(
        startPosition,
        endPosition,
        progress,
      );
      if (this.options.controls) {
        this.options.controls.target.lerpVectors(
          currentTarget,
          sphere.center,
          progress,
        );
        this.options.controls.update();
      } else {
        this.options.camera.lookAt(sphere.center);
      }
      this.options.invalidate?.();
    });
  }

  controlAnimation(
    nodeId: string,
    action: Omit<AnimationAction, 'type' | 'nodeId'>,
  ): void {
    const object = this.requireObject(nodeId);
    this.runtimeState(object).animation = structuredClone(action);
    const clips = Array.isArray(object.userData.animations)
      ? (object.userData.animations as AnimationClip[])
      : [];
    if (clips.length === 0) return;
    const entry = this.getMixer(nodeId, object);
    const clip = action.clip
      ? clips.find((candidate) => candidate.name === action.clip)
      : clips[0];
    if (!clip) return;
    const threeAction =
      entry.actions.get(clip.uuid) ?? entry.mixer.clipAction(clip);
    entry.actions.set(clip.uuid, threeAction);
    if (action.speed) threeAction.setEffectiveTimeScale(action.speed);
    if (action.loop !== undefined) {
      threeAction.setLoop(action.loop ? LoopRepeat : LoopOnce, Infinity);
    }
    switch (action.command) {
      case 'play':
        threeAction.paused = false;
        threeAction.play();
        break;
      case 'pause':
        threeAction.paused = true;
        break;
      case 'toggle':
        if (!threeAction.isRunning()) threeAction.play();
        threeAction.paused = !threeAction.paused;
        break;
      case 'stop':
        threeAction.stop();
        break;
    }
  }

  async controlVideo(
    nodeId: string,
    action: Omit<VideoAction, 'type' | 'nodeId'>,
  ): Promise<void> {
    const object = this.requireObject(nodeId);
    this.runtimeState(object).video = structuredClone(action);
    const video = object.userData.videoElement as HTMLVideoElement | undefined;
    if (!video) return;
    if (action.command === 'seek' && action.currentTime !== undefined) {
      video.currentTime = action.currentTime;
    } else if (action.command === 'pause') video.pause();
    else if (action.command === 'toggle' && !video.paused) video.pause();
    else await video.play();
  }

  setText(nodeId: string, text: string): void {
    this.runtimeState(this.requireObject(nodeId)).text = text;
    this.options.invalidate?.();
  }

  setChartData(nodeId: string, data: unknown): void {
    this.runtimeState(this.requireObject(nodeId)).chartData =
      structuredClone(data);
    this.options.invalidate?.();
  }

  async switchScene(sceneId: string): Promise<void> {
    await this.options.onSwitchScene?.(sceneId);
  }

  async openLink(url: string, target: '_self' | '_blank'): Promise<void> {
    if (this.options.onOpenLink) {
      await this.options.onOpenLink(url, target);
    } else if (typeof window !== 'undefined') window.open(url, target);
  }

  async openPopup(name: string, payload?: unknown): Promise<void> {
    await this.options.onOpenPopup?.(name, payload);
  }

  subscribeNodeEvent(
    nodeId: string,
    event: RuntimeNodeEvent,
    listener: () => void,
  ): () => void {
    return this.options.subscribeNodeEvent(nodeId, event, listener);
  }

  update(deltaSeconds: number): void {
    for (const entry of this.mixers.values()) entry.mixer.update(deltaSeconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const tween of this.tweens.values()) tween.cancel();
    this.tweens.clear();
    for (const entry of this.mixers.values()) {
      entry.mixer.stopAllAction();
      entry.mixer.uncacheRoot(entry.root);
    }
    this.mixers.clear();
    // 先还原模型模板共享材质，再释放运行时 clone，后续文档销毁不会二次释放 clone。
    for (const [mesh, material] of this.originalMaterials) {
      mesh.material = material;
    }
    this.originalMaterials.clear();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear();
    this.highlighted.clear();
    this.options.outline.selectedObjects = [];
  }

  private requireObject(nodeId: string): Object3D {
    const object = this.options.getObject(nodeId);
    if (!object) throw new Error(`运行时节点不存在: ${nodeId}`);
    return object;
  }

  private runtimeState(object: Object3D): Record<string, unknown> {
    if (!object.userData.runtimeState) object.userData.runtimeState = {};
    return object.userData.runtimeState as Record<string, unknown>;
  }

  private getMixer(nodeId: string, root: Object3D): MixerEntry {
    const existing = this.mixers.get(nodeId);
    if (existing?.root === root) return existing;
    if (existing) {
      existing.mixer.stopAllAction();
      existing.mixer.uncacheRoot(existing.root);
    }
    const entry = {
      root,
      mixer: new AnimationMixer(root),
      actions: new Map<string, ThreeAnimationAction>(),
    };
    this.mixers.set(nodeId, entry);
    return entry;
  }

  private tween(
    key: string,
    transition: RuntimeTransition,
    signal: AbortSignal | undefined,
    apply: (progress: number) => void,
  ): Promise<void> {
    this.tweens.get(key)?.cancel();
    const duration = transition.durationMs ?? 0;
    if (duration <= 0 || signal?.aborted) {
      if (!signal?.aborted) apply(1);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const start = performance.now();
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', cancel);
        this.tweens.delete(key);
        resolve();
      };
      const cancel = (): void => {
        const active = this.tweens.get(key);
        if (active) cancelAnimationFrame(active.frameId);
        finish();
      };
      const step = (now: number): void => {
        if (signal?.aborted || this.disposed) {
          finish();
          return;
        }
        const progress = Math.min((now - start) / duration, 1);
        apply(eased(progress, transition.easing));
        if (progress >= 1) finish();
        else {
          const active = this.tweens.get(key);
          if (active) active.frameId = requestAnimationFrame(step);
        }
      };
      const active: ActiveTween = {
        frameId: requestAnimationFrame(step),
        cancel,
      };
      this.tweens.set(key, active);
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }
}
