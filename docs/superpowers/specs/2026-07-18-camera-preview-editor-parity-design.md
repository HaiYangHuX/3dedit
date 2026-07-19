# Camera、漫游、拾取与预览还原设计

## 目标

继续还原 数字孪生 4.0.4 编辑器与预览端的核心体验：Camera 可选择并编辑完整透视相机参数；可在编辑器绘制、保存、播放和删除漫游路径；预览端提供重置、第一/第三人称切换和路径播放；模型点击选择、右下角视角控制器、面板滚动及模型筛选区达到源站同类行为。

本阶段不重新引入源站以 IndexedDB 固定键保存 Three JSON/ZIP 的实现。当前项目继续以服务端 `SceneDocument`、草稿预览和不可变发布 Manifest 为唯一数据边界，避免多场景覆盖、缓存损坏和正式发布引用可变素材的问题。

## 已核对的源站契约

### Camera

- `PerspectiveCamera(45, aspect, 0.05, 20000)`。
- 默认位置 `[0.607, 3.347, 7.966]`，旋转 `[-0.304, 0.048, 0.016]`，Orbit target `[0, 0.5, 0]`。
- 属性包括名称、位置、旋转、缩放、visible、castShadow、receiveShadow、frustumCulled、fov、near、far。
- 位置和缩放以 `0.001` 为输入精度，旋转在界面使用角度、文档使用弧度。
- 修改 `fov/near/far` 后必须调用 `updateProjectionMatrix()`。

### 漫游

- 按住 Ctrl/Command 并左键定点，松开修饰键结束。
- 有效点击最长 `250ms`，最大位移 `5px`。
- 至少两个点才提交路径；播放速度 `4` 世界单位/秒、相机高度 `2`、每段最短 `400ms`。
- 相机沿位置线性插值，并在一段最后 `20%` 使用平滑 quaternion slerp 转向下一段。
- 场景中显示编号标记、青色环和方向箭头，以及 `#ffb347` 橙色虚线路径。
- 播放期间禁用 OrbitControls；停止、完成、切场景或销毁时恢复并释放全部 GPU 资源和事件监听。

### 选择与视角控制

- Canvas 点击判定使用 `5px` 门槛，不因 OrbitControls 的轻微 `change` 事件额外否决。
- “选择整个模型”开启时高亮业务模型根；关闭时高亮真实命中 Mesh，但主业务选择仍保持所属 `SceneNode.id`。
- 右下角使用 `three-viewport-gizmo@2.2.0` 的 cube 模式，尺寸 `90px`，右下角间距 `10px`，支持面、边、角点击和拖拽，并与 OrbitControls 同步。

### 预览与面板

- 预览顶部居中工具栏包含重置相机、第一/第三人称、漫游路径下拉。
- 漫游期间显示“漫游中.. / 取消”；加载覆盖 API、Engine、素材和 Runtime 启动全过程。
- 场景内容树固定高度并独立滚动；下方属性/Camera 配置独立滚动，右侧面板不整体滚动。
- Element Plus 竖向滚动条宽 `3px`，thumb 为半透明青色，hover 加深。
- 模型筛选输入框移除“管理”链接，复用当前深色主题输入样式，不写局部异常尺寸。

## 持久化数据

新增稳定、可验证的业务 DTO，而不是保存 Three Object3D JSON：

```ts
interface SceneCamera {
  type: 'perspective';
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  target: [number, number, number];
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  fov: number;
  near: number;
  far: number;
}

interface CameraRoamingPath {
  id: string;
  name: string;
  pathPoints: Array<[number, number, number]>;
}
```

`SceneDocument` 顶层增加 `camera` 与 `cameraRoamingList`。二者带默认值，旧 `schemaVersion: 1` 文档不升版也能解析。`aspect` 只由容器尺寸派生，不持久化。路径 ID 必须唯一、路径至少两个有限坐标点、`far` 必须大于 `near`。

Camera 和路径随现有保存、复制、hash、草稿预览和发布 Manifest 自动传递，不增加单独的后端表或接口。

## 模块边界

### Scene Schema 与命令

- `packages/scene-schema/src/camera.ts`：Camera/路径 schema、类型和默认值。
- `UpdateCameraCommand`：Camera 属性快照命令，进入 undo/redo、dirty 和显式保存。
- `UpdateCameraRoamingListCommand`：路径列表快照命令，新增和删除均可撤销。

### CameraRoamingSystem

`packages/three-engine/src/camera/CameraRoamingSystem.ts` 由编辑器和 Runtime 共用：

- Editor 模式提供绘制和播放，Runtime 模式只播放。
- 负责状态机、点击投射、标记/虚线路径、delta 驱动播放、资源释放。
- 构造时注入 scene、camera、canvas、OrbitControls、invalidate 和状态回调。
- 开始绘制会停止播放；开始播放会取消绘制；reset、切文档和 dispose 会停止两者。
- 修复源站少于两点时修饰键状态残留、无法显式取消和绘制/播放可能并存的问题。

### EditorEngine 与 Vue

`EditorEngine` 暴露 Camera DTO 的读取/应用、漫游绘制/播放/停止方法，并派发 Camera 与漫游状态事件。Camera 不是伪造的 SceneNode：`EditorWorkspace` 使用独立 `cameraSelected` 状态，与普通节点及二级模型选择互斥。

`CameraInspector.vue` 提供“属性 / 相机漫游”两个页签；`CameraRoamingPanel.vue` 提供路径列表、点数、新增、播放/停止、删除确认和操作提示。所有修改通过 editor-core 命令写入文档。

### Runtime 预览

`RuntimeThreeEngine` 加载文档时应用 Camera 和 target，复用 `PointerLockSystem` 与 `CameraRoamingSystem`，并对 Vue 暴露：

```ts
resetCamera(): void;
requestFirstPerson(): boolean;
exitFirstPerson(): void;
playCameraRoaming(pathId: string): boolean;
stopCameraRoaming(): void;
subscribeNavigation(listener): () => void;
```

每帧相机控制优先级为“漫游 > 第一人称 > Orbit”，同一帧只能有一个控制器写 Camera。CameraMove/focus-node 执行前必须退出当前漫游或第一人称，避免并发 tween。

预览 UI 使用 Runtime 自有纯 Vue 组件和小型 SVG，不引入 Element Plus，继续满足发布包无编辑器依赖及现有体积预算。正式发布也保留完整导航能力；工具栏是否显示由运行模式决定，首期与源站一致在草稿预览显示，正式发布不显示编辑器式浮动工具栏。

### ViewportGizmo

Gizmo 属于 Three renderer 生命周期而不是 Vue DOM 装饰。`EditorEngine` 创建、绑定 OrbitControls、在主 composer 后渲染、resize 时更新、动画期间持续 invalidate，并在 dispose 时对称释放。Vue 的旧 CSS 立方体被移除，只保留承载容器。

## 拾取数据流

```text
canvas pointerdown/up（5px 门槛）
  -> Raycaster 命中 Mesh
  -> { nodeId, hitObject, point }
  -> whole model: SceneNode root highlight
     mesh mode: hitObject highlight
  -> primaryId 始终为 SceneNode.id
  -> Engine-originated selection 单向更新 Pinia
```

Engine 发出的选择不再立即反向调用一次 `setSelection()`，避免大型模型 BoxHelper 重算两次。SelectionBox 在比较选择未变化后才计算包围盒。TransformControls 拖拽期间仍抑制穿透选择。

## 生命周期与错误处理

- Camera/路径文档应用以加载 generation 为边界，晚到结果不能覆盖新场景。
- 路径可视化使用独立 Group；geometry、material、CanvasTexture 去重且只释放一次。
- PointerLock 的 lock/unlock、键盘和 canvas 监听均保存稳定函数引用并在 dispose 移除。
- 路径播放遇到重复点时跳过零长度段，不产生 NaN quaternion。
- 第一人称请求被浏览器拒绝时保持 Orbit 模式并向 UI 返回失败状态。
- 模型加载、Camera 或路径异常不破坏服务端文档；UI 显示局部错误并允许重试。

## 验收

1. Camera 行可选择，属性与漫游页签和源站同类布局；编辑后可保存、刷新、撤销和重做。
2. Ctrl/Command + 左键可绘制至少两点路径，标记、虚线、播放、停止和删除完整。
3. 真实模型轻微手抖点击仍可选择；整模/子 Mesh 模式高亮符合开关。
4. Gizmo 支持面、边、角和拖拽，Camera、Orbit target 与 Gizmo 状态同步。
5. 场景树和属性区独立滚动，滚动条和筛选输入框符合深色主题且无“管理”。
6. 草稿预览可重置、切换第一/第三人称、选择漫游路径、取消漫游，并恢复保存的 Camera。
7. 发布 Manifest 保留 Camera/路径，Runtime 不包含 IndexedDB、TransformControls 或 Element Plus。
8. 完整 `pnpm verify` 通过，并用真实场景执行浏览器视觉与交互验收。
