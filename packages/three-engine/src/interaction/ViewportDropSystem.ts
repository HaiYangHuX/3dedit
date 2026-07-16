import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';

export interface ViewportDropOptions {
  groundY?: number;
  fallbackDistance?: number;
}

/** 把 DOM 拖放坐标转换为场景世界坐标，不依赖窗口整体尺寸。 */
export class ViewportDropSystem {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly ground: Plane;

  constructor(
    private readonly camera: Camera,
    private readonly canvas: HTMLElement,
    private readonly options: ViewportDropOptions = {},
  ) {
    const groundY = options.groundY ?? 0;
    this.ground = new Plane(new Vector3(0, 1, 0), -groundY);
  }

  getWorldPosition(
    clientX: number,
    clientY: number,
    gridSize: number | null = null,
  ): Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
    } else {
      // 容器尚未布局时仍给出可预期的相机正前方位置。
      this.raycaster.ray.origin.setFromMatrixPosition(this.camera.matrixWorld);
      this.camera.getWorldDirection(this.raycaster.ray.direction);
    }

    const point = this.raycaster.ray.intersectPlane(this.ground, new Vector3());
    const position =
      point ??
      this.raycaster.ray
        .at(this.options.fallbackDistance ?? 5, new Vector3())
        .clone();
    if (gridSize !== null && gridSize > 0) {
      position.set(
        Math.round(position.x / gridSize) * gridSize,
        Math.round(position.y / gridSize) * gridSize,
        Math.round(position.z / gridSize) * gridSize,
      );
    }
    // 避免 -0 流入 SceneDocument，否则 JSON diff 会产生无意义的变更。
    position.set(
      Math.abs(position.x) < 1e-10 ? 0 : position.x,
      Math.abs(position.y) < 1e-10 ? 0 : position.y,
      Math.abs(position.z) < 1e-10 ? 0 : position.z,
    );
    return position;
  }
}
