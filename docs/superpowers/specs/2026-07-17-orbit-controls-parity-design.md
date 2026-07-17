# 视口鼠标控制与源站一致性设计

## 目标

让编辑器和发布运行时的轨道相机操作与 ThreeFlowX 线上编辑器一致。Three.js 继续锁定 `0.183.0`，不引入第二套相机控制器。

## 实现依据

以线上 ThreeFlowX `4.0.4` 的 `renderScene-OLdlmnPo.js` 为最终依据，不再沿用 GitHub 仓库旧版控制策略。线上 `initControls()` 明确设置：

- 左键 `MOUSE.PAN`、中键 `MOUSE.DOLLY`、右键 `MOUSE.ROTATE`。
- `enableZoom = true`，`zoomSpeed = 1.5`，`rotateSpeed = 1`，`panSpeed = 1`。
- `screenSpacePanning = false`，平移遵循场景的世界坐标系。
- `target = (0, 0.5, 0)`，`maxPolarAngle = 90°`。
- `maxDistance = 200`，加载或修改模型后不再用包围盒动态覆盖。
- 线上代码未开启 `enableDamping`，保持 OrbitControls 默认的 `false`。

Three.js `0.183.0` 自带 OrbitControls 的默认鼠标映射是左键旋转、右键平移，与线上站点恰好相反；因此必须显式赋值 `mouseButtons`，不能依赖默认值。

## 设计

`OrbitControlsProfile` 是 Three 引擎内部唯一的轨道控制预设边界，集中写入线上版本的按键映射、速度、观察中心和视角限制。EditorEngine 与 RuntimeThreeEngine 都启用 Pan，保证编辑、预览和发布后的操作不发生反转。

删除按模型包围盒重算 `maxDistance` 的旧逻辑，否则场景文档加载、节点增删改后会破坏线上预设的固定值 `200`。

## 验收

- 编辑器、预览和发布端均为：左键平移、滚轮缩放、右键旋转。
- 无阻尼惯性，鼠标释放后立即停止。
- 观察中心为 `(0, 0.5, 0)`，不能旋转到地平面下方。
- 加载不同尺寸的模型后 `maxDistance` 保持 `200`。
- 变换、选择、相机视图按钮和截图流程不回归。
- `pnpm verify` 全部通过。
