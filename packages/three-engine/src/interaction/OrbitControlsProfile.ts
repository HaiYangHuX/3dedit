import { MOUSE, type Vector3 } from 'three';

/**
 * OrbitControls 的最小协议，便于在没有 WebGL 上下文的单元测试中验证交互配置。
 * three/addons/controls/OrbitControls 的实例可以直接满足该接口。
 */
export interface OrbitControlsLike {
  enablePan: boolean;
  enableZoom: boolean;
  enableDamping: boolean;
  target: Vector3;
  maxDistance: number;
  maxPolarAngle: number;
  zoomSpeed: number;
  rotateSpeed: number;
  panSpeed: number;
  screenSpacePanning: boolean;
  mouseButtons: {
    LEFT?: MOUSE | null;
    MIDDLE?: MOUSE | null;
    RIGHT?: MOUSE | null;
  };
  update(deltaTime?: number): boolean;
}

export interface OrbitControlsProfileOptions {
  enablePan: boolean;
}

/**
 * 复现 数字孪生 4.0.4 的 OrbitControls 初始化。
 * 按键映射必须显式设置，因为 OrbitControls 默认恰好是左键旋转、右键平移。
 */
export function configureOrbitControls(
  controls: OrbitControlsLike,
  options: OrbitControlsProfileOptions,
): void {
  controls.enablePan = options.enablePan;
  controls.enableZoom = true;
  controls.enableDamping = false;
  controls.zoomSpeed = 1.5;
  controls.rotateSpeed = 1;
  controls.panSpeed = 1;
  controls.screenSpacePanning = false;
  controls.maxDistance = 200;
  controls.mouseButtons = {
    LEFT: MOUSE.PAN,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.ROTATE,
  };
  controls.target.set(0, 0.5, 0);
  // 限制到地平线之上，避免右键旋转时翻到场景地面下方。
  controls.maxPolarAngle = Math.PI / 2;
  controls.update();
}
