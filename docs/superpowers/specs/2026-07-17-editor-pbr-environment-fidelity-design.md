# 编辑器 PBR 环境与选中态保真设计

## 1. 目标

修复同一 GLB 在 数字孪生 与当前编辑器中出现显著材质差异的问题，使编辑器默认视口在不篡改 GLTF 原始 `color`、`metalness`、`roughness` 和贴图的前提下，复现源站的环境反射、明暗层次与选中反馈。

## 2. 证据与根因

### 2.1 模型材质没有被平台覆盖

对实际上传文件 `DEVICE-4x1装配区-114.glb` 解析后确认：模型包含 17 个 Mesh、17 个 Material、0 个 Texture，由 `THREE.GLTFExporter` 生成。多数材质的 `metallicFactor` 为 `0.5` 或 `1`，`roughnessFactor` 为 `0.1`。现有 `AssetLoader`、`AssetInstanceSystem`、`SceneDocumentSystem` 和 `MaterialSystem` 在节点没有 MaterialComponent 时均保留 GLTF 原始材质，因此问题不在材质覆盖链。

### 2.2 源站真实渲染管线

对 2026-07-17 的 数字孪生 r183 线上构建进行只读检查后确认：

- `renderer.toneMapping = NeutralToneMapping`，曝光为 `1.2`。
- 背景为 `#3b3b3b`，编辑雾为同色 `FogExp2(0.01)`。
- 默认环境文件 `/edit/hdr/view-hdr-1.hdr` 与 Three.js r183 官方示例 `examples/textures/equirectangular/venice_sunset_1k.hdr` 二进制完全一致，SHA-256 为 `0e72ed46b5316cb5fb67fc81ff85b024a09146fd89ef3811a8d2299647ada118`。
- `scene.environmentRotation.y = Math.PI / 2`。
- GLTF 加载后只设置阴影和预览尺寸，不修改材质参数。
- 编辑器选择使用黄色 `BoxHelper`，不通过后处理改变模型表面像素。

### 2.3 当前实现的两个独立根因

1. 当前默认 IBL 来自白色房间、发光面和强灯组成的 `RoomEnvironment`。低粗糙度金属会直接反射大片白色环境，造成白色部件过亮、黄色部件暗部消失、金属表面近似平涂。
2. 当前编辑器使用白色 `OutlinePass`。工业模型零件边缘密集，选中时白线覆盖大量表面像素，进一步产生整体发白错觉。

在没有任何业务灯光的新建隔离场景中，取消选中后问题仍可稳定复现，证明默认 IBL 是主要根因，选中后处理是独立的叠加问题，而不是旧场景灯光数量或曝光参数单独造成。

## 3. 设计决策

### 3.1 默认环境

- 将 Three.js r183 官方 `venice_sunset_1k.hdr` 作为编辑器本地静态资源，随 `editor-web` 构建交付，不依赖源站或远程 CDN。
- `EditorEngine.initialize` 必须等待 HDR 加载及 PMREM 生成完成后再进入文档加载，使首个可验收画面已经具备正确 IBL。
- 默认 HDR 通过 r183 `HDRLoader + PMREMGenerator.fromEquirectangular` 转换；源 HDR 在转换后立即释放，默认 PMREM target 保留至 Engine 销毁。
- `scene.environmentRotation` 固定为 `(0, Math.PI / 2, 0)`，与源站反射方向一致。
- 用户 HDR 仍由 `SceneSettingsSystem` 取代默认环境；清除用户 HDR 时恢复默认 Venice 环境。
- 正常路径不再使用 `RoomEnvironment`。只有本地 HDR 确实加载失败时才创建一次 Room PMREM 作为可用性兜底，避免网络/部署错误让视口完全失去 PBR 光照。
- 默认环境只属于编辑器，不写入 SceneDocument，不自动注入发布运行时。

### 3.2 选中反馈

- 编辑器从 Composer 中移除 `OutlinePass`，保留 `RenderPass -> OutputPass` 作为唯一最终画布输出链。
- 新增独立 `SelectionBoxSystem`。每个选中业务根对象对应一个 `BoxHelper(object, 0xffff00)`，支持当前多选语义。
- BoxHelper 标记为编辑器辅助对象，挂在 Scene 而非文档根节点，不参与业务拾取、序列化和发布。
- 每次有效渲染前更新包围盒，使 TransformControls 拖动、属性编辑和异步模型替换后边框仍准确。
- 选择变化时释放旧 helper 的 geometry/material；Engine 销毁时再次进行幂等清理。
- 运行时交互仍保留现有 OutlinePass，高亮行为不受本轮编辑器视觉修复影响。

## 4. 生命周期与错误处理

1. Renderer 建立后创建 PMREMGenerator，并预编译经纬纹理 shader。
2. 加载默认 HDR；无论转换成功或失败，已经产生的源 Texture 都必须释放。
3. 组件在异步加载期间卸载时，不得再使用已销毁 Renderer；迟到 Texture 直接释放，局部 Generator 随后释放。
4. 默认 HDR 加载失败且 Engine 尚存活时才进入 RoomEnvironment 兜底；兜底环境本身在 PMREM 生成后立即释放。
5. SceneSettingsSystem 销毁时先解除 Scene 对环境的引用并释放用户环境，再释放共享 Generator；EditorEngine 随后释放默认 target。
6. BoxHelper 在选择切换、文档切换和 Engine 销毁时均执行对称清理。

## 5. 测试与验收

- 单元测试证明默认环境加载使用指定本地 HDR URL、调用 PMREM、释放源 Texture，并能安全丢弃卸载后的迟到结果。
- 单元测试证明用户 HDR 清除后恢复默认环境，所有 source Texture、PMREM target 和 Generator 对称释放。
- 单元测试证明编辑器选中产生黄色 BoxHelper、变换后更新、换选和销毁后释放；SelectionSystem 不再写 OutlinePass。
- 兼容边界测试证明 Three.js runtime 为 `0.183.0`，编辑器使用 HDRLoader、环境旋转和 OutputPass，Runtime OutlinePass 保持不变。
- Vite 构建产物必须包含本地 HDR；记录资源来源、SHA-256 和 Three.js MIT 归属。
- 使用同一 `DEVICE-4x1装配区-114.glb` 在无业务灯光的隔离场景做 1280×720 WebGL 验收：白色底座不过曝，黄色机械臂有清楚的高光与暗部，钢件体现环境反射，选中前后模型材质颜色一致，控制台 error 为 0。

## 6. 非目标

- 不修改或猜测模型原始材质参数。
- 不用降低曝光、全局压暗颜色或套用平台默认材质掩盖问题。
- 不在运行时隐式加入编辑器默认 HDR、网格或 BoxHelper。
- 不在本轮增加 SceneDocument 版本字段。
