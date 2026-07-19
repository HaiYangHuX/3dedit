# 编辑器视觉布局与 PBR 材质基础设计

**日期：** 2026-07-16

**状态：** 已按用户确认的推荐路线进入实施

**上位设计：** `docs/superpowers/specs/2026-07-16-digital-twin-scene-platform-design.md`

## 1. 背景与本周期边界

项目已经完成多模型加载、场景树、选择与变换、命令历史、场景保存、交互配置、WebSocket、草稿预览和原子发布闭环。当前编辑器仍是 48/280/380 的宽松骨架布局，材质只存在于模型原始资源或基础几何体的临时默认值中，与 数字孪生 的高密度编辑体验仍有明显差距。

本周期只交付两个可以独立验收的基础子系统：

1. 数字孪生 风格的高密度工作台与完整视口基础操作。
2. 可保存、可撤销、编辑器和发布运行时一致的节点级 PBR 材质覆盖系统。

文本、标注、图片平面、视频、ECharts、Shader 工业特效、动画面板、爆炸图、相机路径、第一人称、Bloom、测量、框选和吸附仍按上位设计保留，但分别进入后续周期，不能挤入本周期造成未经测试的横向铺开。

## 2. 方案比较与决策

### 方案 A：只改 Vue 样式并直接修改 Three Material

- 优点：改动小，短期能得到相似截图。
- 缺点：刷新后材质丢失，无法撤销；模型实例可能共享 Material，修改一个节点会污染其他节点；预览和发布运行时不一致；贴图和 GPU 生命周期不可控。
- 结论：拒绝。这只能制作静态演示，不能作为数字孪生编辑器基础。

### 方案 B：协议驱动的增量基础层（采用）

- 视觉布局在 Vue 层重组，但所有相机操作仍通过 `EditorCanvas` 桥接到 `EditorEngine`。
- 材质成为 `SceneComponent` 的强类型成员；`MaterialSystem` 将协议投影到 Three.js 对象，并管理异步贴图代次、原材质恢复和 GPU 释放。
- 节点级覆盖先统一作用于节点下所有 Mesh；数据结构保留稳定扩展点，后续再增加子网格或材质槽定位，不在本周期引入不稳定的 glTF 遍历路径。
- 优点：范围可控，保存、撤销、预览、发布和资源引用可以一次闭环；不会把运行对象放入 Pinia。
- 缺点：本周期不能对同一模型的不同子网格分别配置不同材质。

### 方案 C：一次性实现完整材质图、子网格选择和插件化面板

- 优点：最终能力最完整。
- 缺点：需要同时解决稳定子网格 ID、模型重传后的映射迁移、材质资产实体、材质实例复用和复杂 UI；与当前视口基础重构耦合后无法形成小步验收。
- 结论：后续演进方向，不作为本周期实施方案。

## 3. 验收目标

### 3.1 视觉与布局

在 1280×720 浏览器视口下：

- 顶栏高 33px。
- 左栏宽 180px，由约 60px 的竖向分类轨道和约 120px 的资源内容区组成。
- 右栏宽 340px，一级标签高约 32px。
- 中央视口占据其余全部空间，不再为底部状态栏保留网格行。
- 变换、坐标空间、聚焦、相机重置、截图和全屏操作集中在视口顶部悬浮工具条。
- 对象、网格、顶点、面和 FPS 统计显示在视口左下浮层。
- 右下显示可点击的方向方块，可切换前、后、左、右、上、下视图，并随相机方向更新。
- 保存状态进入顶栏；发布结果仍为非阻塞浮层。
- 颜色基线为顶层 `#070a13`、面板 `rgba(11, 15, 25, 0.96)`、卡片 `#0d1527`、强调色 `#38bdf8`。

布局参考 数字孪生，但保留自己的品牌、中文文案、DOM 结构和可访问性标签，不复制其静态资源。

### 3.2 视口操作

- W/E/R 切换移动、旋转和缩放；当前模式有明确选中态。
- 世界/局部坐标可切换，并同步 `TransformControls`。
- F 聚焦选中节点。
- 相机重置回编辑器默认视角和默认 OrbitControls target。
- 方向方块以短动画切换六个正交观察方向，旋转期间仍保持唯一 Composer 主场景渲染路径。
- 截图从当前 WebGL canvas 输出 PNG，并由浏览器下载。
- 全屏以中央 `viewport-shell` 为边界，而不是把整个管理应用全屏。
- 视口事件与 DOM 监听在组件或引擎销毁时对称释放。

### 3.3 PBR 材质

- 模型和基础几何体都能启用节点级材质覆盖。
- 支持 `standard`、`physical`、`phong`、`basic`。
- 通用参数：颜色、透明开关、不透明度、线框、正面/背面/双面、深度测试、深度写入。
- 光照材质参数：发光颜色、发光强度、环境反射强度。
- Standard/Physical 参数：粗糙度、金属度。
- Physical 参数：清漆、清漆粗糙度、反射率。
- Phong 参数：高光颜色和光泽度。
- 节点参数：投射阴影、接收阴影。
- 贴图槽：Base Color、Normal、Roughness、Metalness、AO、Emissive。
- 每个贴图槽独立保存 UV offset、repeat、rotation 与 `repeat`、`clamp`、`mirror` 包裹方式。
- Base Color 与 Emissive 使用 `SRGBColorSpace`，数据贴图使用 `NoColorSpace`；贴图加载以实际 r183 API 为准。
- “恢复原始材质”删除覆盖组件，模型恢复资源自带材质，基础几何体恢复引擎默认材质。
- 所有面板编辑都通过 `UpdateNodeCommand`，支持撤销、重做、显式保存、草稿预览和正式发布。

## 4. 场景协议

新增强类型 `material` 组件。它是节点级覆盖，不存储 Three.js UUID、Material UUID 或运行时 Texture 对象。

```ts
type MaterialType = 'standard' | 'physical' | 'phong' | 'basic';
type MaterialSide = 'front' | 'back' | 'double';
type TextureWrap = 'repeat' | 'clamp' | 'mirror';

interface MaterialTextureBinding {
  assetId: string;
  offset: [number, number];
  repeat: [number, number];
  rotation: number;
  wrapS: TextureWrap;
  wrapT: TextureWrap;
}

interface MaterialComponent {
  kind: 'material';
  materialType: MaterialType;
  color: string;
  transparent: boolean;
  opacity: number;
  wireframe: boolean;
  side: MaterialSide;
  depthTest: boolean;
  depthWrite: boolean;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  envMapIntensity: number;
  clearcoat: number;
  clearcoatRoughness: number;
  reflectivity: number;
  specular: string;
  shininess: number;
  normalScale: [number, number];
  aoMapIntensity: number;
  castShadow: boolean;
  receiveShadow: boolean;
  textures: {
    baseColor: MaterialTextureBinding | null;
    normal: MaterialTextureBinding | null;
    roughness: MaterialTextureBinding | null;
    metalness: MaterialTextureBinding | null;
    ao: MaterialTextureBinding | null;
    emissive: MaterialTextureBinding | null;
  };
}
```

数值范围由 Zod 在协议边界校验。UI 同时设置合理的 min/max/step，但不能把浏览器输入约束当作数据安全边界。

`assetReferences` 必须同时包含 model、environment 和所有 material texture assetId。服务端继续从组件重建引用，不能相信客户端自报引用。发布服务必须复制贴图资源到独立 release，正式运行时只从 Manifest 解析贴图。

## 5. Three.js 架构

### 5.1 MaterialSystem 所有权

`MaterialSystem` 位于 `packages/three-engine`，由每个 `SceneDocumentSystem` 生命周期独占：

```text
EditorEngine / RuntimeThreeEngine
  └─ SceneDocumentSystem
       ├─ AssetInstanceSystem
       └─ MaterialSystem
            ├─ TextureLoader 与模板缓存
            ├─ 节点原材质快照
            └─ 当前覆盖 Material / Texture clone
```

职责：

- 遍历节点业务根下的 Mesh，并记录应用覆盖前的 `material` 引用。
- 根据协议创建 r183 材质；同一节点的所有 Mesh/slot 可以共享一个覆盖材质实例。
- 异步加载贴图模板，再按绑定 clone Texture 并应用 UV 参数，避免一个节点的 UV 修改污染另一个节点。
- 以 generation token 丢弃场景切换或快速更新后迟到的贴图结果。
- 更新或恢复时先把 Mesh 指回原材质，再去重释放覆盖 Material 与 Texture clone。
- 系统销毁时释放贴图模板缓存；不释放由模型模板缓存拥有的原始 Geometry、Material 和 Texture。

贴图单槽失败不阻断整个文档加载：材质其余参数仍生效，失败信息写入节点运行对象的 `userData.materialErrors` 并进入 LoadReport。场景切换导致的过期结果不是业务错误，必须静默释放。

### 5.2 与 SceneDocumentSystem 集成

- 创建或替换节点：对象完成实例化后再应用材质覆盖。
- 增量更新：变换和组件基础属性同步后调用 MaterialSystem；若材质组件未变化，系统通过稳定 JSON key 跳过重建。
- 删除节点：先恢复并释放节点覆盖，再交给 AssetInstanceSystem 或通用资源释放器处理对象。
- 文档切换：Asset 与 Material 使用同一文档代次，迟到结果均不能进入新文档。
- 编辑器与运行时使用同一 MaterialSystem，保证预览/发布一致。

### 5.3 相机和方向方块

不使用额外 WebGLRenderer，也不在主 Composer 之外再次渲染 Three 场景。`EditorEngine` 发出轻量 `camerachange` DTO：

```ts
interface CameraOrientation {
  quaternion: [number, number, number, number];
}
```

Vue `ViewportGizmo` 用纯 DOM/CSS 3D 方块显示方向。点击面后调用 `EditorEngine.setCameraView(view)`。引擎在原 RAF 中插值 camera position、quaternion 和 OrbitControls target；相机动画会持续 invalidate，结束后恢复按需渲染。

### 5.4 截图与统计

- `captureScreenshot()` 把请求排入 EditorEngine；下一次 Composer 渲染完成后立即调用 canvas `toBlob`，避免读取已清空的默认 framebuffer。
- Engine RAF 统计 UI 刷新频率，并结合 `renderer.info.render.calls` 暴露 FPS 和 draw calls；场景几何统计仍由 SceneDocumentSystem 计算。
- 性能事件限频到约 500ms，不能每帧触发 Vue 更新。

## 6. Vue 组件与数据流

### 6.1 组件拆分

- `EditorWorkspace.vue`：工作台编排、当前工具状态、下载和全屏意图。
- `EditorTopBar.vue`：品牌、场景名、保存状态、重置场景、预览/发布；撤销/重做由快捷键触发。
- `AssetPalette.vue`：竖向资源分类和对应内容插槽；模型库仍由 `AssetLibraryPanel` 查询。
- `ViewportToolbar.vue`：变换、空间、聚焦、重置、截图、全屏。
- `ViewportGizmo.vue`：CSS 方向方块和六方向点击。
- `ViewportStats.vue`：限频统计浮层。
- `MaterialInspector.vue`：材质类型、参数、贴图槽和恢复操作。
- `NodeInspector.vue`：继续组合 Transform、Material 和业务数据，不直接操作 Three.js。

小组件只通过显式 props/emits 交流，不能导入 EditorEngine 实例。`EditorCanvas.vue` 是唯一 Vue ↔ Three.js 桥接边界。

### 6.2 材质编辑数据流

```text
MaterialInspector input/change
→ emit 完整 material component
→ NodeInspector clone components
→ EditorWorkspace commands.updateNode
→ UpdateNodeCommand + documentStore markDirty
→ EditorCanvas.applyNodeUpdated
→ SceneDocumentSystem.updateNode
→ MaterialSystem.apply
→ Composer invalidate
```

控件在 `change` 时提交命令，颜色和 range 控件可按同一次指针交互只提交最终值，避免拖动一个滑块生成数十条历史记录。后续若需要实时预览，可增加命令合并键，但本周期不绕过命令系统。

### 6.3 贴图选择

材质面板复用现有模型库中的 ready 图片/贴图资源，显示资源名和缩略图；可以清除绑定或跳转到素材管理上传。当前上传协议把 PNG/JPG/JPEG/WebP 归类为 image，面板同时接受 `image` 和 `texture` kind，为以后显式贴图分类保留兼容。

## 7. 错误处理

- WebGL 初始化、材质构建和截图失败继续显示在 canvas 错误层或 Element Plus message 中。
- 不支持的材质类型不做静默回退，由 Zod 拒绝保存；运行时防御性回退到 Standard 只用于处理绕过协议的对象。
- TextureLoader 失败按槽记录，其他槽仍可显示。
- `toBlob` 返回 null 时拒绝 Promise，UI 不下载空文件。
- Fullscreen API 缺失或拒绝时显示操作错误，不改变编辑器布局状态。
- 恢复材质和 dispose 都必须幂等，删除节点、切场景和组件卸载可以按任意正常顺序执行。

## 8. 测试与验收

### 8.1 单元测试

- `scene-schema`：接受完整 material component，拒绝越界 PBR 数值和无效贴图绑定。
- `MaterialSystem`：类型映射、颜色空间、UV、迟到加载、恢复原材质、共享资源不被释放、销毁去重。
- `SceneDocumentSystem`：创建、更新、删除和替换节点时正确调用 MaterialSystem。
- 服务端：贴图进入规范化 assetReferences 和发布资源集合。
- Vue：材质创建/更新/恢复 emit，视口工具栏状态和方向方块事件，EditorCanvas 新桥接方法。

### 8.2 集成与视觉验收

- 运行现有完整测试，确保模型上传、交互、WebSocket 和发布闭环无回归。
- Chromium 中以 1280×720 验证 33/180/340 布局、面板无横向溢出、视口占满剩余空间。
- 添加两个几何体，给其中一个设置 Physical 材质和贴图，确认另一个不受影响。
- 撤销/重做材质编辑；保存后刷新；草稿预览和发布运行时材质一致。
- 点击六个方向面、重置相机、截图和全屏，检查控制器仍可继续操作。
- 控制台无未处理 Promise、WebGL 错误和资源销毁警告。

## 9. 非功能约束

- `three@0.183.0`、`@types/three@0.183.1` 精确锁定，运行时包是 API 权威。
- Addon 使用 `three/addons/...`；颜色输出使用 `outputColorSpace`。
- 主场景每帧只由 Composer 最终渲染一次。
- Renderer、Composer、Controls、Loader、Material、Texture、监听器、RAF 和 ResizeObserver 有明确所有者。
- 所有新增核心类、异步代次、资源边界和非显然 UI 逻辑使用有效中文注释，避免逐行复述语法。
- 不修改旧 React/Koa 项目，不增加登录、权限、多租户或业务历史版本。

## 10. 后续演进接口

本周期结束后，材质协议可在保持节点级覆盖默认行为的前提下增加 `targets`，目标使用模型解析阶段生成的稳定 mesh/material slot ID，而不是运行时遍历下标。之后再实现子网格拾取、材质列表定位、材质资产复用和批量修改。该演进不要求修改本周期的 Texture binding、资源引用或 MaterialSystem 生命周期原则。
