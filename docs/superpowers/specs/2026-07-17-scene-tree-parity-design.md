# 场景内容两级模型列表与精确选择设计

## 目标

将编辑器右侧“场景内容”修正为 ThreeFlowX 4.0.4 的真实行为：顶部固定显示 Camera；场景对象作为一级；模型内部只展示经过筛选和格式化的二级项。模型的 Group/Object3D 包装层不进入列表，也不允许出现第三级。单击二级项时精确高亮对应 Mesh，而不是只选中整个模型根。

## 已核对的源站契约

源站生产构建中的场景树数据函数位于 `/tmp/main-CQ7gXOjm.formatted.js` 的 `ht`（页面导入别名 `Ea`），场景内容组件位于 `/tmp/threeflowx-index.formatted.js:6170-6650`：

- 一级数据只读取 `scene.children.filter(child => child.userData.isTransformControls)`。
- 模型二级数据调用 `root.traverse(...)`，只收集 `Mesh`，不输出 Group/Object3D 的递归层级。
- 单材质 Mesh 使用 Mesh UUID、Mesh 名称和 Mesh 类型；空名称回退为“未命名材质”。
- 多材质 Mesh 按材质 UUID 去重并使用材质名称；本项目额外保留其所属 Mesh UUID，避免源站多材质行无法精确高亮的问题。
- 所有二级候选按展示 UUID 去重，最终直接挂在所属模型一级项下。
- 模型实例创建调用 `Re(name)`，其实现为 `${name}_${四位随机数}`；外部上传模型传入包含扩展名的原文件名。
- `onCurrentChange` 调用 `chooseMaterial`，后者通过 UUID 找到真实对象并执行黄色选择高亮。

此前实现把任意 Object3D 递归投影成树，并仅把二级点击映射到业务根。这与上述源站函数不符，是出现“模型根 → 包装 Group → Mesh”三级结构和无法单独选择二级项的根因。

## 数据结构

`SceneDocument` 仍是持久化业务节点的唯一来源。运行时模型列表使用只读快照：

```ts
interface ModelPartItem {
  objectId: string;
  targetObjectId: string;
  name: string;
  objectType: string;
}

type ModelStructureMap = Record<string, ModelPartItem[]>;
```

- Map key 是所属模型的稳定 `SceneNode.id`。
- `objectId` 是树行唯一键：单材质为 Mesh UUID，多材质为 Material UUID。
- `targetObjectId` 是需要高亮的 Mesh UUID；单材质时与 `objectId` 相同。
- 快照不含 `children`，从类型层面保证模型结构只能显示固定二级。
- Object3D/Material UUID 只在当前加载代次有效，不进入 Pinia、API、发布文档或撤销历史。

## 投影和名称规则

`SceneDocumentSystem.getModelStructures()` 对每个主组件为 `model` 的业务根递归遍历，但只收集 Mesh：

1. 遇到具有独立 `sceneNodeId` 的业务子节点时跳过其整棵子树，避免重复。
2. 单材质 Mesh 输出一行，名称使用 `mesh.name || '未命名材质'`。
3. 多材质 Mesh 为每个有效材质输出一行，名称使用 `material.name || '未命名材质'`，高亮目标仍是所属 Mesh。
4. 按 `objectId` 保留第一次出现的项目并保持 traverse 顺序。
5. Group、Scene、Bone 等只作为遍历路径，不输出列表行。

新建模型实例时，`createAssetNode` 使用资源名、格式和四位随机数生成源站格式的持久化名称，例如 `DEVICE-刀具库压缩.glb_5076`。已经具有 `_<四位数字>` 后缀的名称不重复加工。旧场景节点没有保存该后缀时，`SceneTree` 根据素材库中的真实格式和稳定 `SceneNode.id` 派生四位展示码，避免刷新后名称变化；底层文档名称仍保留原值。

## 二级选择数据流

```text
SceneTree 二级行
  -> select-model-part({ nodeId, objectId, targetObjectId })
  -> EditorWorkspace
  -> EditorCanvas.selectModelPart(nodeId, targetObjectId)
  -> EditorEngine.selectModelPart()
  -> SceneDocumentSystem.getModelPartObject()
  -> SelectionBoxSystem 精确包围目标 Mesh
```

- 引擎仍把所属 `SceneNode` 作为业务主选择，因此属性面板、删除、复制等持久化命令不会收到瞬时 UUID。
- 二级选择不附加 TransformControls，防止修改无法持久化的模型内部局部变换。
- `SceneTree` 使用独立 `selectedModelPartId` 高亮二级行；选择 Camera、一级节点、视口其他对象或空白时清除该状态。
- 模型删除、替换或场景重载后，工作区根据新快照清理已经失效的二级 UUID。
- `F` 聚焦优先使用当前二级 Mesh；没有二级选择时继续聚焦业务选择。

## 展示行为

- Camera 位于模型列表之前，不写入 `SceneDocument`。
- 模型一级项可以展开/收起；展开内容永远是平铺二级列表。
- 二级项无展开箭头、无第三级、不可拖放、只显示源站同类的替换/删除视觉操作（当前阶段只实现可安全执行的选择，避免伪造未接入的材质命令）。
- 搜索可匹配一级和二级名称；命中二级时保留所属一级项。
- 一级业务节点继续保留现有重命名、复制、显隐、锁定、删除和业务层级拖放能力。

## 生命周期与错误处理

- 无效或过期的二级 UUID 返回 `false`，不保留旧高亮。
- 增量更新或删除会先按业务选择刷新整模引用，再用所属根和 UUID 重新解析二级目标；仍有效则恢复精确高亮，失效则清除。文档重载始终清除旧代次选择。
- 模型加载失败时保留业务一级节点；占位 Mesh 若存在材质，可按同一规则生成二级项。
- 多材质的 Material UUID 只用于树行去重和高亮键，实际包围盒始终绑定所属 Mesh。

## 验证

- Three 单元测试构造“模型根 → Group → Mesh → Mesh”，断言所有 Mesh 都直接成为二级项且数据中不存在 `children`。
- Three 单元测试验证非 Mesh 过滤、业务子树截断、单/多材质命名、UUID 去重和目标 Mesh 解析。
- 创建节点测试验证 `文件名.格式_四位数字` 且不会重复添加扩展名或后缀。
- SceneTree 测试验证只有两级、二级点击事件、独立 current 高亮和一级选择清理。
- EditorCanvas 桥接测试验证 `selectModelPart(nodeId, targetObjectId)` 透传并返回引擎结果。
- 浏览器使用 `DEVICE-人工换刀压缩` 和 `DEVICE-4x1装配区-114` 验证无包装 Group 行、无第三级并可精确高亮二级 Mesh。
