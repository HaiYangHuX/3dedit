# 场景图表与文本组件设计

## 目标

在现有数字孪生场景编辑器中完整接入图表和文本素材，使它们能够被添加、拖入、选择、变换、编辑、撤销、保存，并在预览和发布运行时保持一致。运行时的 `set-text` 与 `set-chart-data` 动作必须更新真实画面，而不是只写入临时状态。

## 约束

- 保持 Vue 3、TypeScript、Pinia、Element Plus 和 `three@0.183.0`。
- 场景文档只保存 JSON 数据，不保存 Three.js、DOM、Canvas 或 ECharts 实例。
- 不兼容现有 `{ kind: 'text' | 'chart', data: Record<string, Json> }` 占位协议，直接改为强类型组件。
- 属性修改进入命令历史，但只有用户点击保存才写入后端。
- 编辑器、预览和发布运行时共用相同的对象工厂和更新逻辑。
- 新增代码使用中文注释说明生命周期、坐标映射和协议边界，不添加逐行复述代码的注释。
- 产品文案不使用第三方项目品牌名。

## 协议

### 文本组件

`TextComponent` 保存以下字段：

- `kind: 'text'`
- `textMethod`: 12 种文本模板方法
- `textType: 'Sprite' | 'Mesh'`
- `color: string`
- `fontSize: number`，范围 8 至 24
- `textContent: string`，最多 100 个字符

文本模板包含纯文本、固定面板、动效面板、音乐、科技、时尚、西部、校园、数字孪生、物联网感知、全息面板和赛博 HUD。模板沿用生产实现的画布尺寸、透明背景、主要构图与默认字号，示例文案改为当前产品的中性内容。

### 图表组件

`ChartComponent` 保存以下字段：

- `kind: 'chart'`
- `chartType`: `pie | line | funnel | stacked-line | stacked-bar | radar | scatter | gauge | heatmap`
- `width: number`
- `height: number`
- `option: Record<string, Json>`

九种模板使用 JSON 可序列化的 ECharts option。属性面板以 JSON 编辑器形式更新整个 option；运行时 `set-chart-data` 同样把对象作为完整 option 覆盖更新。

## Three.js 对象形态

### 文本

文本节点使用稳定 `Group` 作为业务根。显示内容是 `Sprite` 或 `PlaneGeometry + MeshBasicMaterial` 子节点，纹理由高分辨率 Canvas 创建。更新文字、颜色、字号或模板时替换 CanvasTexture；切换显示类型时只替换显示子节点，业务根和 TransformControls 引用保持稳定。

### 图表

图表节点使用稳定 `Group` 作为业务根，包含：

- 与图表世界尺寸一致、材质不可见但可被 Raycaster 命中的拾取盒；
- `CSS3DObject`，内部挂载固定尺寸的 ECharts DOM。

编辑器和运行时各持有一个 CSS3DRenderer，并在同一相机、同一场景和同一容器尺寸下渲染。CSS 图表区域保留指针事件；额外 OrbitControls 使用与主画布相同的左键平移、滚轮缩放、右键旋转配置，并同步主控制器 target，保证鼠标从画布进入图表后导航手感不变。

## 数据流

1. 素材面板点击或拖放生成强类型 SceneNode，并通过 AddNodeCommand 写入内存文档。
2. SceneDocumentSystem 调用共享对象工厂创建文本或图表对象。
3. NodeInspector 修改组件字段，通过 UpdateNodeCommand 进入撤销历史，再调用增量 Three 桥接更新运行对象。
4. 用户点击保存后，SceneDocument 才提交到 API。
5. 预览和发布加载同一 SceneDocument，RuntimeThreeEngine 使用相同工厂创建对象。
6. 运行时动作通过 SceneDocumentSystem 的 `setText` / `setChartData` 更新组件控制器；无对应控制器时仍保留原有 runtimeState 诊断信息。

## 生命周期

- 文本更新立即释放被替换的 Texture、Material 和 Geometry。
- 图表删除、撤销、重载或引擎销毁时调用 `echarts.dispose()`、移除 DOM 事件和元素。
- CSS3DRenderer、辅助 OrbitControls、ResizeObserver 和 RAF 由对应 Engine 对称释放。
- SceneDocumentSystem 在资源实例系统判定对象是否共享之前先释放组件控制器，避免 ECharts DOM 被普通 Three 资源分支跳过。

## 编辑器体验

- 图表面板显示九个模板，文本面板显示十二个模板，均支持单击添加和拖入画布。
- 场景树为图表和文本使用明确的 Element Plus 图标。
- 文本属性提供面向屏幕/面向场景、颜色、字号和内容。
- 图表属性提供格式化 JSON 编辑区、错误反馈和“更新图表数据”按钮。
- 图表 DOM 单击同步编辑器选择；拖动图表区域进行相机导航时不误触选择。

## 验收

- Schema 能拒绝旧占位结构和非法模板、尺寸、字号、option。
- 所有文本模板均能创建纹理，Sprite/Mesh 可切换且保持业务根不变。
- 所有图表模板均能创建 ECharts 实例，option 与尺寸可增量更新。
- 添加、拖放、属性编辑、撤销、重做和显式保存链路完整。
- `set-text` 与 `set-chart-data` 在预览和发布中即时改变画面。
- 删除、撤销、切换场景和卸载后没有遗留图表 DOM 或 ECharts 实例。
- lint、typecheck、unit test、build 和浏览器桌面视口验收全部通过。
