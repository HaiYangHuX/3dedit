# 数字孪生场景平台完整设计

**日期：** 2026-07-16

**状态：** 已确认

**新项目目录：** `/Users/haiyang/Desktop/3d编辑器/3d编辑器前后端/数字孪生场景平台`

**参考项目：** `zhangbo126/threejs-3dmodel-edit`、公开版 `zhangbo126/ThreeFlow`、ThreeFlowX 在线编辑器与 v4.0.6 文档

## 1. 背景与决策

现有 React、Ant Design、Umi 和 Koa 项目是极简验证版本，编辑器、Three.js 生命周期、持久化协议和后端数据结构不足以继续扩展成完整数字孪生低代码平台。

本次采用全新项目重构，不修改以下旧目录：

- `数字孪生前端-3DEdit`
- `数字孪生后端-koa`

新平台使用 Vue 3、TypeScript、Pinia、Element Plus 和 Three.js r183，覆盖多模型场景搭建、模型与素材管理、属性编辑、交互编排、WebSocket 实时数据、预览和发布的完整闭环。

参考项目的核心行为、算法和参数效果应尽可能还原，包括模型加载、材质、灯光、动画、背景、标签、Shader、后期处理、拖放定位、交互和导出。还原目标是行为一致，不照搬参考项目中的单体文件、模块级可变状态、资源泄漏和响应式滥用。

## 2. 目标

平台必须支持以下用户闭环：

```text
创建项目
→ 管理模型与素材
→ 创建和切换场景
→ 拖入多个场景元素
→ 编辑层级、变换、材质、灯光、环境和动画
→ 配置低代码交互和 WebSocket 任务
→ 保存当前场景
→ 独立预览
→ 发布当前内容
→ 获取运行地址和 iframe 嵌入代码
```

工程目标：

- 编辑器内核不依赖 Vue，能够被编辑器和发布运行时复用。
- 自有场景协议与 Three.js 运行对象解耦。
- 所有可撤销编辑通过命令系统执行。
- 编辑器与发布运行时使用独立应用和独立构建产物。
- 模型、贴图、场景包和发布包使用对象存储，不写入数据库。
- 耗时资源处理使用后台 Worker 和任务队列。
- 全部核心代码具有充分、有效的中文注释和中文文档。

## 3. 首期非目标

首期明确不实现：

- 登录、账号、角色、权限和多租户。
- 模型历史版本、场景历史版本、发布版本列表、版本对比和手动回滚。
- Electron 桌面端。
- WebGIS、Google 3D Tiles 和体积云。
- 浏览器内在线模型减面。
- 高级粒子编辑器和植物编辑器。
- 审核、计费和云端配额。

系统仍保留两个非业务版本字段：

- `schemaVersion`：标识场景协议格式，用于数据结构迁移。
- `revision`：只用于并发保存检测，不保存历史内容。

## 4. 技术基线

### 4.1 工程与前端

- pnpm workspace Monorepo
- Node.js 24
- TypeScript strict
- Vue 3
- Vite
- Pinia
- Element Plus
- Three.js 精确锁定为 `0.183.0`，禁止使用 `^`
- `@types/three` 精确锁定为 `0.183.0`，与运行时保持同一修订号
- Zod：场景协议和接口数据校验
- Monaco Editor：JSON、表达式和消息调试
- Vitest、Vue Test Utils、Playwright
- ESLint、Prettier、Stylelint、Husky

Three.js r183 的 npm 包不内置 TypeScript 声明，因此同时精确锁定 `@types/three@0.183.0`。运行时包始终是 API 兼容性的最终依据，类型声明不得与运行时使用不同修订号。

### 4.2 后端与基础设施

- NestJS
- Fastify Adapter
- PostgreSQL
- Prisma ORM
- OpenAPI
- 标准 WebSocket
- Redis
- BullMQ
- MinIO
- glTF Transform
- Sharp
- Docker Compose

后端采用模块化单体，不在首期拆分微服务。`asset-worker` 独立进程处理模型和发布任务，但与 API 服务共享契约和基础设施。

## 5. Monorepo 结构与边界

```text
数字孪生场景平台/
├── apps/
│   ├── editor-web/       # 项目、模型库、素材库和场景编辑器
│   ├── runtime-web/      # 预览和发布运行时
│   ├── api-server/       # NestJS HTTP/WebSocket 服务
│   └── asset-worker/     # 资源解析、缩略图、打包和发布任务
├── packages/
│   ├── scene-schema/     # 场景协议、Zod 校验和迁移
│   ├── three-engine/     # Three.js r183 渲染内核
│   ├── editor-core/      # 命令、历史、选择、剪贴板和编辑上下文
│   ├── runtime-core/     # 交互、动画、数据绑定和运行时生命周期
│   ├── api-contracts/    # DTO、错误码和共享接口
│   └── shared/           # 无业务依赖的通用工具
├── infrastructure/
│   ├── docker/
│   └── migrations/
├── docs/
└── docker-compose.yml
```

依赖规则：

- Vue 组件不能直接创建或销毁 Scene、Renderer、Controls、Pass 和 Loader。
- `three-engine` 不依赖 Vue、Pinia 或 Element Plus。
- `runtime-web` 不依赖 `editor-core`。
- `editor-core` 与 `runtime-core` 都依赖 `scene-schema`，但互不反向依赖。
- `runtime-web` 不加载编辑器面板、TransformControls、选择辅助对象和历史系统。
- API 业务模块通过公开服务协作，不能直接访问其他模块的 Prisma Repository。

## 6. 页面与编辑器布局

### 6.1 路由

```text
/projects                    项目管理
/projects/:projectId         项目详情、场景列表和发布状态
/assets                      模型与素材库
/editor/:projectId/:sceneId  场景编辑器
/preview/:sceneId            当前场景预览
/runtime/:publicationId      当前发布运行时
```

### 6.2 工作台

首期布局参考 ThreeFlowX，不进行独立视觉创新：

```text
┌──────────────────── 顶部工具栏 ────────────────────┐
│ 项目/场景、保存、撤销重做、导入导出、预览、发布      │
├───────┬────────────────────────────┬───────────────┤
│ 资源区 │                            │ 场景内容       │
│       │       Three.js 视口         │ 交互事件       │
│ 模型   │                            │ Socket 任务    │
│ 几何体 │                            │ 项目配置       │
│ 灯光等 │                            │ 属性检查器     │
├───────┴────────────────────────────┴───────────────┤
│ 对象数、顶点数、面数、FPS、保存状态和任务进度         │
└────────────────────────────────────────────────────┘
```

顶部工具栏包含项目和场景切换、保存状态、撤销重做、变换模式、坐标空间、导入导出、截图、预览、发布、全屏和帮助。

左侧资源区包含模型、几何体、灯光、图表、文本、标签、图片、图标、视频、Shader 和工业特效，支持搜索、分类、拖入和双击添加。

右侧一级标签为：场景内容、交互事件、Socket 任务、项目配置和帮助。属性检查器根据节点组件动态显示基础属性、变换、模型、材质、灯光、动画、标签、图表、视频、Shader、特效和业务数据面板。

### 6.3 Pinia 边界

- `projectStore`：当前项目、场景和发布状态。
- `documentStore`：可序列化 `SceneDocument`。
- `selectionStore`：选中节点 ID、主选中节点和选择模式。
- `assetStore`：模型和素材查询缓存。
- `viewportStore`：工具模式、视口偏好和辅助线状态。
- `interactionStore`：当前交互和 Socket 任务表单状态。
- `jobStore`：上传、解析、导出和发布进度。
- `preferencesStore`：主题、面板尺寸和快捷键偏好。

Scene、Object3D、Material、Texture、Renderer 和 Controls 不进入 Pinia 深度响应式状态。需要在 Vue 层暴露的运行对象使用 `markRaw` 或 `shallowRef`，并由引擎持有所有权。

## 7. 功能范围

### 7.1 项目与场景

- 项目创建、编辑、复制、删除、搜索和封面。
- 一个项目包含多个场景，支持切换、复制和排序。
- 草稿自动保存、手动保存和保存状态提示。
- 项目模板和场景模板。
- 项目名称、默认场景、加载页和发布参数。

不提供场景历史版本和回滚。

### 7.2 模型与素材库

- 上传 GLB、GLTF、FBX、OBJ、STL 和 USDZ。
- 模型分类、标签、搜索、分页和收藏。
- 模型缩略图、预览、文件大小和基础信息。
- 重新上传后原子替换当前模型文件，不保留历史版本。
- 模型解析状态、失败原因和重试。
- 提取动画、材质、贴图、包围盒、顶点数和面数。
- 支持 Draco、Meshopt 和 KTX2 资源。
- HDR、图片、视频、贴图和图标素材管理。
- 素材使用统计、删除保护和无效资源清理。

### 7.3 场景元素

- 外部模型。
- 基础几何体。
- 环境光、平行光、点光源、聚光灯和半球光。
- 文本、3D 标签和设备标注。
- 图片和图标。
- 视频平面。
- ECharts 折线、柱状、饼图、雷达、仪表盘、散点和热力图。
- Shader 元素。
- 电子围栏、警告护栏、警告光圈、扩散圈、物流传送带等工业效果。

### 7.4 视口与通用编辑

- OrbitControls 和方向 Gizmo。
- TransformControls 移动、旋转和缩放。
- 世界坐标与局部坐标。
- 单选、多选、框选和主选中对象。
- 整体模型与子网格选择模式。
- 撤销、重做和命令合并。
- 复制、粘贴、删除、重命名、显隐、锁定和分组。
- 聚焦、相机重置、双击定位和自动置地。
- 网格、角度、对象和地面吸附。
- 网格、坐标轴、包围盒和灯光辅助线。
- 测距、测量线和测量结果清除。
- W、E、R、F、Delete、Ctrl/Cmd+Z 等快捷键。

### 7.5 场景树

- 名称搜索、展开和折叠。
- 拖拽调整父子层级和顺序。
- 场景树与视口双向选中同步。
- 批量显隐、锁定、删除和分组。
- 对象数、顶点数、面数和资源占用统计。

### 7.6 对象、材质与贴图

- 名称、可见性、阴影和渲染顺序。
- 位置、旋转、缩放、统一缩放、轴心和视觉中心。
- 模型拆分、组合和业务属性。
- 材质列表、材质定位和网格定位。
- Standard、Physical、Phong、Basic 等材质类型。
- 颜色、透明度、线框、双面和深度参数。
- 粗糙度、金属度、发光、清漆和反射率等 PBR 参数。
- BaseColor、Normal、Roughness、Metalness、AO、Emissive 等贴图。
- 贴图上传、预览、下载、替换和移除。
- UV 重复、偏移、旋转和包裹模式。
- 材质复制、恢复和批量修改。

### 7.7 灯光、环境和天气

- 环境光、平行光、点光源、聚光灯和半球光的完整属性。
- 投射阴影、阴影贴图和灯光辅助线。
- 纯色、图片、HDR 全景和视频背景。
- Scene Environment 与 Background 分离配置。
- 纯色地面、网格地面、透明和接收阴影。
- 雾、基础天气、曝光和色调映射。

### 7.8 动画、相机和特效

- GLTF 动画列表、播放、暂停、循环和速度。
- X、Y、Z 轴持续旋转动画。
- 位移、缩放、显隐补间动画。
- 模型分解和爆炸图。
- 选中轮廓和 Bloom 辉光。
- Shader 时间 Uniform 和动画。
- 相机位置、目标、FOV 和裁剪面。
- 默认相机视角、相机点位、路径漫游和巡检路线。
- 第一人称漫游。

## 8. 自有场景协议

业务数据不能只依赖 `scene.toJSON()`。Three.js 序列化可作为模型内部资源处理工具，但平台以稳定的自有协议保存场景。

```ts
interface SceneDocument {
  schemaVersion: number;
  id: string;
  projectId: string;
  name: string;
  revision: number;
  rootNodeIds: string[];
  nodes: Record<string, SceneNode>;
  settings: SceneSettings;
  interactions: InteractionDefinition[];
  dataSources: DataSourceDefinition[];
  socketTasks: SocketTaskDefinition[];
  assetReferences: AssetReference[];
}
```

```ts
interface SceneNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  name: string;
  enabled: boolean;
  locked: boolean;
  transform: TransformComponent;
  components: SceneComponent[];
  businessData: Record<string, JsonValue>;
}
```

组件使用可辨识联合类型，覆盖模型、几何体、灯光、相机、文本、标签、图片、视频、图表、Shader、动画、特效和自定义业务组件。

稳定业务 ID 由平台生成，不能使用 Three.js UUID 作为持久化主键。引擎维护以下映射：

```text
SceneNode ID ↔ Three Object3D ↔ Asset ID
```

场景协议要求：

- 所有字段通过 Zod 校验。
- 未识别组件不能阻止整个场景加载，应显示为异常占位节点。
- 迁移函数必须是单向、确定和可测试的纯函数。
- `schemaVersion` 只表示协议格式，不向用户提供版本界面。
- 二进制内容只存 Asset ID 或对象存储 Key，不嵌入 JSON。

## 9. 编辑器内核

### 9.1 生命周期接口

```ts
interface EditorEngine {
  initialize(container: HTMLElement): Promise<void>;
  loadDocument(document: SceneDocument): Promise<void>;
  applyCommand(command: EditorCommand): Promise<void>;
  resize(width: number, height: number, dpr: number): void;
  update(deltaSeconds: number): void;
  createSnapshot(): SceneDocument;
  dispose(): Promise<void>;
}
```

`EditorEngine` 统一拥有 Scene、Camera、Renderer、EffectComposer、OrbitControls、TransformControls、ViewportGizmo、RAF、ResizeObserver、Loader、AnimationMixer、CSS Renderer、RenderTarget、事件监听器和异步任务。

### 9.2 参考代码映射

| 参考模块 | 新模块 |
|---|---|
| `renderModel.js`、`renderScene.ts` | `EditorEngine` 与生命周期服务 |
| `materialModules` | `MaterialSystem` |
| `lightModules` | `LightingSystem` |
| `animationModules` | `AnimationSystem` |
| `transformControlsModules` | `TransformSystem` |
| `backgroundModules` | `EnvironmentSystem` |
| `manyModelModules` | `AssetInstanceSystem` |
| `tagsModules` | `AnnotationSystem` |
| `shaderModules` | `ShaderSystem` |
| `stageFlowModules` | `PostProcessingSystem` |
| `historyModules` | `CommandHistory` |

迁移时保留参考项目的功能语义、参数范围、交互习惯和核心算法，同时修复以下架构问题：

- 单个类承担全部场景功能。
- 模块级可变全局变量。
- Pinia 深度响应 Three.js 对象。
- Vue 表单直接修改运行对象。
- Renderer 和 Composer 重复渲染。
- 匿名事件监听器无法卸载。
- 异步加载晚到结果污染新场景。
- 场景切换未释放 GPU、DOM、动画和 Socket 资源。

### 9.3 r183 渲染约束

- 使用 `three/addons/...`。
- 使用现代颜色管理和 `outputColorSpace`。
- Composer 启用时每帧只执行一次 Composer 渲染。
- 使用容器 `ResizeObserver`，不以 `window.innerWidth` 作为编辑视口尺寸。
- DPR 默认封顶。
- Pointer 坐标以 Canvas `getBoundingClientRect()` 计算。
- Loader 使用 AbortController；无法取消的 Loader 使用加载世代令牌。
- 迟到资源必须立即释放，不能加入已切换的场景。
- `ResourceTracker` 对共享 Geometry、Material 和 Texture 进行引用计数。
- AnimationMixer 停止后执行 uncache。
- 场景销毁时释放 Controls、Pass、RenderTarget、Loader、DOM、监听器和 RAF。

## 10. 命令、历史与选择

```ts
interface EditorCommand {
  execute(context: EditorContext): void | Promise<void>;
  undo(context: EditorContext): void | Promise<void>;
  merge?(next: EditorCommand): EditorCommand | undefined;
}
```

要求：

- 添加、删除、复制、层级调整、变换、材质、灯光、环境、动画和交互修改都通过命令执行。
- 滑块连续输入合并为一条历史记录。
- 多选操作使用组合命令，撤销时整体恢复。
- 命令同时修改 `SceneDocument` 和引擎运行对象，任一步失败都回滚。
- 保存成功时记录干净点，之后的命令令场景进入未保存状态。
- 删除节点时同步清理选择、交互引用、Socket 任务引用和辅助对象。
- 选择系统把子网格命中规范化为业务可选择节点，支持整体模型和材质选择模式。

## 11. 后端模块与数据模型

### 11.1 模块

```text
projects       项目管理
scenes         场景与当前内容
assets         模型与素材
uploads        分片上传
jobs           后台任务和进度
publications   当前发布结果
data-sources   WebSocket 数据源配置
realtime       任务进度和运行时消息
```

### 11.2 数据表

- `projects`
- `scenes`
- `assets`
- `asset_files`
- `asset_dependencies`
- `processing_jobs`
- `publications`
- `data_sources`

不创建用户、权限、租户、资产版本、场景版本和发布版本表。

`scenes` 保存当前 `SceneDocument JSONB`、`revision`、内容哈希、封面和更新时间。交互、Socket 任务和资源引用属于场景文档，保证保存和发布时保持一致。

## 12. 模型上传与资源处理

### 12.1 上传流程

```text
创建上传任务
→ 获取 MinIO 分片上传地址
→ 上传源文件
→ 完成分片并校验 SHA-256
→ 创建 BullMQ 处理任务
→ Worker 分析模型和生成缩略图
→ 写入元数据和派生资源
→ WebSocket 推送完成或失败状态
```

### 12.2 处理内容

- SHA-256 校验和重复文件识别。
- 格式、大小、包围盒、顶点数和面数统计。
- 提取材质、贴图、动画和相机信息。
- 检查 Draco、Meshopt 和 KTX2。
- 生成缩略图。
- 保留源文件和派生文件。
- 保存解析日志、失败原因和重试次数。
- 删除前检查场景和当前发布引用。

GLTF/GLB 使用 glTF Transform 分析。其他格式使用 Three.js r183 对应 Loader。缩略图通过无界面的 `runtime-web` 渲染并截图，保证与浏览器显示一致。

模型重新上传时先解析新文件；只有新文件处理成功后才原子替换当前资源指针。当前发布包使用独立资源，不会因模型替换立即损坏。

### 12.3 MinIO Key

```text
assets/{assetId}/source/
assets/{assetId}/derived/
assets/{assetId}/textures/
assets/{assetId}/thumbnail/
scenes/{sceneId}/imports/
publications/{publicationId}/
```

数据库只保存元数据、对象 Key、哈希和引用关系。

## 13. 场景保存

- 编辑器防抖自动保存当前场景。
- 用户可以手动保存并看到保存状态。
- 请求携带 `baseRevision`。
- 服务端发现 `baseRevision` 与当前 `revision` 不一致时返回 `409`，避免多个标签页互相覆盖。
- 保存前前后端都执行 Zod 校验。
- 服务端重新计算资源引用，不信任前端资源清单。
- 保存成功后更新当前场景内容和 `revision`，不保留旧内容。
- 场景导入导出使用 ZIP 和 Worker，支持进度、取消和错误报告。

## 14. 低代码交互

```ts
interface InteractionDefinition {
  id: string;
  name: string;
  enabled: boolean;
  sourceNodeId: string;
  trigger: TriggerDefinition;
  conditions: ConditionDefinition[];
  execution: 'sequential' | 'parallel';
  actions: ActionDefinition[];
}
```

### 14.1 触发器

- 场景加载完成。
- 单击、双击、鼠标进入和鼠标离开。
- 定时和延迟。
- 模型动画结束。
- WebSocket 消息。
- 场景变量变化。
- 进入和离开指定区域。

一个对象可以绑定多个交互事件。

### 14.2 条件

- 相等、不等、大于、小于和包含。
- 对象显隐状态。
- 场景变量。
- WebSocket 消息字段。
- `AND`、`OR` 组合。

条件使用受控表达式系统，不直接执行任意 JavaScript。

### 14.3 动作

- 显示、隐藏和切换显隐。
- 修改位置、旋转、缩放和颜色。
- 高亮和取消高亮。
- 播放、暂停和切换模型动画。
- 播放和暂停视频。
- 更新文本和图表数据。
- 启停轴动画。
- 移动、聚焦和切换相机点位。
- 切换场景。
- 打开链接和业务弹窗。
- 设置场景变量。
- 延迟执行其他动作。

动作支持串行、并行、持续时间和缓动函数。

编辑器交互预演模式与发布运行时共用 `runtime-core`。预演时暂停选择和 TransformControls，避免编辑操作与运行时交互冲突。

## 15. WebSocket 实时数据

WebSocket 是首期核心能力，必须保留。

数据源配置包含：

- 名称和连接地址。
- 自动连接、心跳、重连次数和指数退避。
- 消息格式和 JSONPath 字段映射。
- 模拟消息和调试日志。
- Socket 任务列表。

任务数据保留参考项目的 `taskCode`、`taskType`、`taskTime` 和 `taskData` 概念：

```json
{
  "taskCode": "device-001-position",
  "taskType": "ModelPosition",
  "taskTime": 500,
  "taskData": {
    "x": 10,
    "y": 0,
    "z": 5
  }
}
```

运行时根据 `taskCode` 查找任务，支持更新位置、旋转、缩放、显隐、颜色、文本、图表、视频、动画和相机。

断开后显示状态并执行指数退避重连。场景切换和销毁必须主动关闭连接、心跳和重连定时器。

## 16. 预览与发布

### 16.1 预览

`/preview/:sceneId` 读取当前场景内容，支持交互、WebSocket、动画、相机漫游和运行时调试，不修改发布数据。

### 16.2 发布

`/runtime/:publicationId` 只加载当前发布包，不加载 Element Plus、编辑面板、TransformControls 和历史系统。

无版本发布流程：

```text
校验当前场景协议
→ 校验资源状态和引用
→ 生成临时发布包
→ 运行时预检
→ 原子切换当前 Publication 指针
→ 清理被替换的旧发布包
```

发布失败时不切换指针，当前线上内容继续可用。系统只展示当前发布状态，不提供发布版本列表和手动回滚。

发布输出：

- 访问地址。
- iframe 嵌入代码。
- 全屏和自适应运行时。
- 运行 Manifest、场景 JSON 和独立资源包。

## 17. 性能设计

首期以桌面 Chrome、1920×1080 和中等独立显卡作为基线：

- 约 2,000 个场景节点。
- 约 100 个模型实例。
- 约 500 万可见三角面时保持基本可编辑。
- 常规编辑场景目标不低于 30 FPS。
- 面板输入不能阻塞渲染循环。
- 场景切换后旧资源必须可回收。
- 上传支持大文件分片、失败重试和续传。

优化措施：

- 静态场景按需渲染，动画和实时数据场景连续渲染。
- 相同模型共享 Geometry、Material 和 Texture 缓存。
- 重复模型提供 InstancedMesh 优化入口。
- 使用视锥裁剪、LOD、资源懒加载和按需后期处理。
- Raycaster 只检测可选择层。
- DPR 封顶。
- ZIP、哈希、复杂统计和转换进入 Worker。
- GPU 资源采用引用计数。
- 视频、CSS Renderer、WebSocket 和定时器进入统一生命周期。

## 18. 异常处理

### 18.1 前端

- 模型加载失败显示占位节点、错误原因和重试操作。
- 场景切换取消旧加载任务，迟到结果立即释放。
- WebGL Context Lost 时暂停编辑并尝试恢复。
- 资源缺失不阻止其他节点加载，异常节点在场景树中标记。
- 命令失败回滚文档和运行对象。
- 保存冲突提供重新加载和明确覆盖操作。
- 交互目标不存在时跳过单个动作，不中断整个场景。
- WebSocket 断线时显示状态并自动重连。

### 18.2 后端

- 统一业务错误码和请求 ID。
- 上传完成前校验分片、大小和 SHA-256。
- 场景保存校验协议和资源引用。
- 后台任务默认重试三次并保留每次错误日志。
- 发布失败不替换当前线上内容。
- PostgreSQL、Redis 和 MinIO 提供健康检查。
- 使用结构化日志记录请求、资源、任务和发布上下文。

## 19. 测试策略

### 19.1 单元测试

- 场景协议和迁移。
- 命令执行、撤销、重做和合并。
- 选择、多选和父子层级。
- 材质与灯光参数转换。
- 条件表达式与动作执行。
- WebSocket 消息映射。
- 资源引用和释放。

### 19.2 Three.js 浏览器集成测试

- GLTF、FBX、OBJ、STL 和 USDZ 加载。
- 材质、贴图、灯光和动画还原。
- TransformControls、Raycaster 和选择模式。
- AnimationMixer 生命周期。
- Outline、Bloom 和 Composer。
- 容器 ResizeObserver。
- 场景切换、异步晚到结果和内存释放。
- 参考项目关键效果截图对比。

Three.js 行为测试在真实 Chromium 中执行，不用纯 DOM 模拟替代 WebGL 验证。

### 19.3 后端集成测试

- 使用测试容器运行 PostgreSQL、MinIO 和 Redis。
- 分片上传、任务队列、保存和发布流程。
- 资源引用删除保护。
- 新模型处理失败时旧模型保持可用。
- 发布失败时当前线上内容保持可用。

### 19.4 端到端测试

```text
创建项目
→ 上传并解析模型
→ 创建场景
→ 拖入多个模型
→ 编辑材质、灯光和动画
→ 配置交互与 WebSocket 任务
→ 保存
→ 预览
→ 发布
→ 验证运行时
```

另设性能样例场景和重复打开/关闭场景的资源泄漏测试。

## 20. 中文注释与文档标准

- 核心导出类、接口、方法和 Vue composable 必须有中文 TSDoc/JSDoc。
- Three.js 资源所有权、释放责任和共享规则必须注释。
- 异步取消、加载世代、并发保存和发布原子切换必须注释原因。
- 命令撤销、协议迁移、表达式执行和资源转换必须解释不直观约束。
- 注释重点说明“为什么”和“必须保持的约束”，不能只复述语法。
- 修改行为时同步修改或删除旧注释。
- 每个应用和核心包提供中文 README。
- 提供场景协议、交互协议、WebSocket 协议、部署和故障排查文档。
- 提供模块依赖图和新增场景组件的开发指南。

## 21. 验收标准

满足以下条件视为首期完成：

1. 旧前后端目录没有被新平台改动。
2. Docker Compose 能启动 PostgreSQL、Redis、MinIO、API、Worker、编辑器和运行时。
3. 用户无需登录即可完成项目、模型库、场景编辑、预览和发布闭环。
4. 模型库支持约定格式、分片上传、解析、缩略图、替换和删除保护。
5. 场景支持多模型及已列出的元素、材质、灯光、动画、环境和特效配置。
6. 视口支持层级、选择、多选、变换、吸附、历史、快捷键和测量。
7. 一个节点可配置多个低代码交互事件。
8. WebSocket 能驱动模型、文本、图表、视频、动画和相机。
9. 当前场景能够保存、导入、导出和预览。
10. 发布失败不影响当前线上内容，发布成功后原子切换。
11. 编辑器与运行时使用同一场景协议和交互执行内核。
12. Three.js 生命周期、异步加载和共享资源释放通过测试。
13. 单元、集成、浏览器和端到端测试通过。
14. 核心代码具有充分有效的中文注释，核心包具有中文文档。
