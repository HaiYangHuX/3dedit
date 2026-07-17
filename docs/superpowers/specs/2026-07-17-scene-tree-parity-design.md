# 场景树模型结构与 Camera 一致性设计

## 目标

将编辑器右侧“场景内容”区按 ThreeFlowX 4.0.4 还原为真实场景结构树：顶部固定显示 Camera，模型实例可展开 GLB/GLTF/FBX/OBJ/USDZ 加载后的 `Object3D` 子层级，同时修复当前白色树背景、选中态、行尺寸和 Emoji 操作图标。

## 源站契约

源站构建文件 `/tmp/threeflowx-index.formatted.js` 的场景内容组件表明：

- 搜索使用 Element Plus `ElInput`，占位文案为“请输入内容名称”，前缀为搜索图标。
- Camera 位于模型树之前，使用黄色相机图标和名称 `Camera`。
- 树数据来自实时 Three.js 场景，模型根节点可展开真实子对象层级，而不是只显示业务实例。
- `ElTree` 行高 28px，深色半透明背景，hover 和 current 使用青色左边框，操作图标为 18px Element 按钮。
- 树区高度 370px，使用 Element Plus 滚动容器。

## 核心数据设计

### 持久化业务树

`SceneDocument.nodes` 继续是可编辑、可撤销、可发布的唯一业务节点来源。模型实例根、基础几何、灯光和组节点仍使用稳定 `SceneNode.id`，保留当前选择、复制、显隐、锁定、删除和拖拽重排能力。

### 运行时模型结构投影

`SceneDocumentSystem` 新增只读 `getModelStructures()`，从每个主组件为 `model` 的真实 Three.js 对象根开始递归导出：

```ts
interface ModelStructureNode {
  objectId: string;
  name: string;
  objectType: string;
  children: ModelStructureNode[];
}

type ModelStructureMap = Record<string, ModelStructureNode[]>;
```

Map 的 key 为稳定业务 `SceneNode.id`，值为对应模型根内部的 Object3D 子树。遇到具有自己 `sceneNodeId` 的业务子节点时停止投影，避免与持久化树重复。未命名对象回退为 Three.js `object.type`。

`EditorEngine` 透传该快照；`EditorCanvas` 在文档加载、节点新增、替换、删除后发出 `model-structure-change`；`EditorWorkspace` 保存最新快照并传给 `SceneTree`。快照不进入 Pinia 文档 Store，不进入 API，也不随场景发布。

## 场景树展示

`SceneTree` 将业务树和模型结构投影合并为 Element Tree 数据：

- 业务节点使用 `data-node-id`，允许选择、拖拽和操作。
- 模型内部对象使用 `data-object-id`，只读展示并禁止拖拽；单击时选中其所属模型根，与当前引擎按整模选择的契约一致。
- 搜索同时匹配业务节点和 Object3D 名称，子级匹配时保留完整祖先链。
- Camera 是树之前的固定系统项，不写入 `SceneDocument`，不参与删除、复制和拖拽。
- 移除与源站不一致的“N 个已选 / 组合”顶部条；组合命令保留在编辑核心，不在该树栏重复占位。

## 视觉与图标

- 搜索、树、滚动区、Tooltip 均使用 Element Plus。
- Camera 使用 `CameraFilled`，模型和内部对象使用 `Box`，几何、灯光和组使用语义相近的 Element 图标。
- 业务操作移除 Emoji，改为 `EditPen` / `CopyDocument` / `View`·`Hide` / `Lock`·`Unlock` / `Delete`，所有提示使用 `ElTooltip`。
- 样式直接使用源站的 28px 行高、`#0f172a80` 背景、青色 hover/current 左边框和 18px 操作按钮，并用 `!important` 覆盖 Element Tree 的默认浅色背景。

## 错误与生命周期

- 模型加载失败时仍保留业务根节点，占位对象层级可正常展示。
- 异步加载代次失效时不发送过期快照；只有 `EditorEngine.loadDocument()` 成功后才投影层级。
- 节点替换完成后才发送新快照，避免树指向已释放的 Object3D UUID。
- 场景切换时新快照整体替换旧快照，不跨场景复用。

## 验证

- Three 单元测试验证嵌套 Object3D 投影、未命名回退和业务子节点排除。
- `EditorCanvas` 测试验证加载成功后发出快照。
- `SceneTree` 测试验证 Camera、模型子结构、搜索祖先、禁止内部节点拖拽、Element 图标与 Tooltip。
- Playwright/本地浏览器使用已上传的真实 GLB 验证展开层级、Camera 和深色树样式。
