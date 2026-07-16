import { PerspectiveCamera, Vector3, type QuaternionTuple } from 'three';

export type CameraView = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface CameraOrientation {
  quaternion: QuaternionTuple;
}

export interface CameraControlsTarget {
  target: Vector3;
  update(deltaTime?: number): boolean | void;
}

export interface ViewportCameraSystemOptions {
  durationSeconds?: number;
}

interface CameraTransition {
  elapsed: number;
  fromPosition: Vector3;
  fromTarget: Vector3;
  toPosition: Vector3;
  toTarget: Vector3;
}

const viewDirections: Record<CameraView, Vector3> = {
  front: new Vector3(0, 0, 1),
  back: new Vector3(0, 0, -1),
  left: new Vector3(-1, 0, 0),
  right: new Vector3(1, 0, 0),
  top: new Vector3(0, 1, 0),
  bottom: new Vector3(0, -1, 0),
};

/**
 * 只负责序列化相机过渡，不创建额外渲染器。OrbitControls 仍是观察中心和
 * 最终 lookAt 的唯一所有者，因此动画结束后用户可以无缝继续轨道操作。
 */
export class ViewportCameraSystem {
  private readonly defaultPosition: Vector3;
  private readonly defaultTarget: Vector3;
  private readonly defaultDistance: number;
  private readonly durationSeconds: number;
  private transition?: CameraTransition;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly controls: CameraControlsTarget,
    options: ViewportCameraSystemOptions = {},
  ) {
    this.defaultPosition = camera.position.clone();
    this.defaultTarget = controls.target.clone();
    this.defaultDistance = Math.max(
      this.defaultPosition.distanceTo(this.defaultTarget),
      2,
    );
    this.durationSeconds = Math.max(options.durationSeconds ?? 0.22, 0);
  }

  setView(view: CameraView): void {
    const target = this.controls.target.clone();
    const currentDistance = this.camera.position.distanceTo(target);
    const distance =
      currentDistance > Number.EPSILON ? currentDistance : this.defaultDistance;
    this.startTransition(
      target.clone().addScaledVector(viewDirections[view], distance),
      target,
    );
  }

  reset(): void {
    this.startTransition(this.defaultPosition, this.defaultTarget);
  }

  cancel(): void {
    this.transition = undefined;
  }

  update(deltaSeconds: number): boolean {
    const transition = this.transition;
    if (!transition) return false;
    transition.elapsed += Math.max(deltaSeconds, 0);
    const progress =
      this.durationSeconds === 0
        ? 1
        : Math.min(transition.elapsed / this.durationSeconds, 1);
    const eased = 1 - (1 - progress) ** 3;
    this.camera.position.lerpVectors(
      transition.fromPosition,
      transition.toPosition,
      eased,
    );
    this.controls.target.lerpVectors(
      transition.fromTarget,
      transition.toTarget,
      eased,
    );
    this.controls.update(deltaSeconds);
    if (progress >= 1) this.transition = undefined;
    return true;
  }

  getOrientation(): CameraOrientation {
    return { quaternion: this.camera.quaternion.toArray() };
  }

  private startTransition(position: Vector3, target: Vector3): void {
    this.transition = {
      elapsed: 0,
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: position.clone(),
      toTarget: target.clone(),
    };
  }
}
