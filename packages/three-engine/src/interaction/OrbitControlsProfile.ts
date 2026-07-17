import { Box3, Vector3, type Object3D } from 'three';

/**
 * OrbitControls 的最小协议，便于在没有 WebGL 上下文的单元测试中验证交互配置。
 * three/addons/controls/OrbitControls 的实例可以直接满足该接口。
 */
export interface OrbitControlsLike {
  enablePan: boolean;
  enableDamping: boolean;
  dampingFactor: number;
  target: Vector3;
  object: Object3D;
  maxDistance: number;
  update(deltaTime?: number): boolean;
}

export interface OrbitControlsProfileOptions {
  enablePan: boolean;
  target?: readonly [number, number, number];
}

/**
 * 复现 ThreeFlowX 的 OrbitControls 初始化：阻尼保留默认 0.05，观察中心默认位于世界原点。
 * 编辑器和运行时只通过 enablePan 区分交互权限，避免两边的鼠标手感继续漂移。
 */
export function configureOrbitControls(
  controls: OrbitControlsLike,
  options: OrbitControlsProfileOptions,
): void {
  controls.enablePan = options.enablePan;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  const target = options.target ?? [0, 0, 0];
  controls.target.set(target[0], target[1], target[2]);
  controls.update();
}

/**
 * 源站用模型包围盒对角线的十倍限制滚轮拉远距离。
 * 空场景保持现有上限，否则首次加载无模型文档时相机距离会被无意义地改写。
 */
export function updateOrbitControlsDistanceLimit(
  controls: OrbitControlsLike,
  root: Object3D,
): number {
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty()) return controls.maxDistance;

  const size = bounds.getSize(new Vector3());
  const currentDistance = controls.object.position.distanceTo(controls.target);
  // 当前距离兜底，避免加载一个很小的模型时下一帧把相机强行推入模型内部。
  const maxDistance = Math.max(size.length() * 10, currentDistance);
  controls.maxDistance = maxDistance;
  return maxDistance;
}
