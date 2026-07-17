# 视口变换工具栏与 ThreeFlowX 4.0.4 一致性设计

## 目标

将编辑器画布上方的视口工具栏按 ThreeFlowX 4.0.4 线上实现完整迁移，不仅复刻按钮外观，还复刻按钮状态、快捷键和三维行为。工具栏只保留源站的 8 个操作：变换模式、模型落地、第一/第三人称、测量、相机重置和整模选择。

## 源站行为契约

源站构建文件 `renderScene-OLdlmnPo.js` 的 `transform-controls` 组件明确包含：

1. **拖拽（W）**：`TransformControls` translate 模式。
2. **旋转（E）**：`TransformControls` rotate 模式。
3. **缩放（R）**：`TransformControls` scale 模式。
4. **对齐所有模型到地面**：遍历场景业务根对象，按世界包围盒最低点将根节点抬到 `y = 0.01`；天气和测量线排除。
5. **第一/第三人称**：第三人称按钮创建 `PointerLockControls`，W/A/S/D 以 `delta * 0.1 * 48` 移动相机，ESC 解锁并回到第三人称。
6. **测量工具**：进入后取消当前变换选择并切换十字光标；点击两个不同的模型点绘制测量线和距离标签，距离显示为世界距离除以 10 的米数；ESC 结束当前测量模式。
7. **重置场景相机位置**：相机位置 `(0.607, 3.347, 7.966)`、旋转 `(-0.304, 0.048, 0.016)`、观察中心 `(0, 0.5, 0)`。
8. **整模选择**：默认开启；开启时射线命中模型内部网格后上溯到业务模型根节点，按钮显示 active。

快捷键 W/E/R 只在焦点不属于输入控件、没有测量模式、没有第一人称锁定时生效；ESC 优先退出测量或第一人称。

## 架构

- `ViewportToolbar.vue` 只负责源站 8 个按钮的渲染和事件转发，使用 Element Plus 图标；不持有 Three 状态。
- `EditorEngine` 继续拥有相机、OrbitControls 和 TransformControls，并新增三个受控能力边界：
  - `PointerLockSystem`：负责 PointerLockControls、键盘移动、锁定/解锁生命周期。
  - `MeasurementSystem`：负责画布拾取、测量线、CanvasTexture 距离标签和资源释放。
  - `alignModelsToGround()`：在文档根节点范围内计算世界包围盒并返回可写入命令历史的变换差异。
- `SelectionSystem` 增加整模选择开关和拾取禁用状态。测量模式禁用普通选择，避免测量点被误提交为节点选择。
- `useEditorCommands` 将对齐地面作为一条 `TransformNodesCommand` 写入撤销栈；第一人称、测量和整模选择通过 `EditorCanvasBridge` 调用引擎。
- 编辑器视图只保存三个 UI 状态：`isPointerLock`、`isMeasuring`、`isChooseAllModel`，它们由引擎事件驱动，按钮状态不会与 Three 实例分叉。

## 视觉与交互

工具栏采用源站 CSS：顶部 `12px`、深色半透明背景、`backdrop-filter: blur(10px)`、24px 按钮、active 蓝色渐变、竖向分隔线和源站图标顺序。保留中文 tooltip 文案和源站“测量工具已打开，按 Esc 键退出测量模式”提示。

## 生命周期与错误处理

- PointerLockControls、测量线、CanvasTexture、事件监听器均由 EditorEngine 创建并在 `dispose()` 对称释放。
- 场景重新加载、切换文档或销毁引擎时退出第一人称、结束测量并清理临时测量图层。
- 对齐地面遇到空包围盒、非有限包围盒或锁定节点时跳过，并不阻断其他节点。
- 测量只接受有效模型交点；第二点与第一点距离小于 `0.001` 时忽略；空白点击不改变当前测量点。

## 验证

- Vue 组件测试验证 8 个按钮顺序、active 状态、tooltip 和事件。
- Three 引擎单元测试验证对齐地面、第一人称移动步长、测量距离换算和生命周期释放。
- Playwright 真实 WebGL E2E 验证 W/E/R、对齐地面、测量模式、整模选择状态和源站工具栏 DOM 顺序。
