# 场景内容两级模型列表与精确选择实施计划

**Goal:** 修正错误的递归 Object3D 树，实现源站固定两级的 Mesh/材质列表、实例名称格式和二级精确高亮。

**Architecture:** `SceneDocumentSystem` 递归遍历但只输出平铺 `ModelPartItem[]`；`EditorEngine` 通过所属模型根校验瞬时 UUID 并让共享 `SelectionBoxSystem` 高亮目标 Mesh；Vue 层保存独立的二级 current key，业务选择仍使用 `SceneNode.id`。

**Tech Stack:** Three.js 0.183.0、Vue 3.5.40、TypeScript 5.9.3、Element Plus 2.14.3、Vitest 4.1.10。

## 全局约束

- 不升级 Three.js；运行时和类型继续固定 0.183.x。
- 不把 Object3D/Material UUID 写入文档、Pinia 持久化、API 或撤销栈。
- 模型内部项固定为第二级，类型中不再提供递归 `children`。
- 二级选择只高亮、不挂载 TransformControls。
- 所有新增非显然逻辑使用简洁中文注释。

### Task 1：失败测试和源站契约锁定

- [ ] 修改 `SceneDocumentSystem.test.ts`：断言 Group 被过滤、深层 Mesh 被平铺、业务子树被截断、名称回退和多材质目标映射。
- [ ] 修改 `SceneTree.test.ts`：断言只有一级/二级，二级点击发出 `select-model-part`，二级可独立 current。
- [ ] 修改 `EditorCanvasBridge.test.ts`：断言二级选择桥接透传。
- [ ] 修改创建节点测试：断言模型实例名称格式。
- [ ] 运行定向测试并确认因旧递归结构/API 缺失而失败。

### Task 2：Three 两级投影和精确选择

- [ ] 将 `ModelStructureNode` 改为无 children 的 `ModelPartItem`。
- [ ] `SceneDocumentSystem` 按源站 traverse + Mesh/Material 规则生成平铺列表，并提供受所属根约束的目标查找。
- [ ] `EditorEngine.selectModelPart()` 同步业务根选择、精确包围目标 Mesh并让 `F` 优先聚焦二级对象。
- [ ] 在加载、删除、替换和普通选择时清理瞬时二级引用。
- [ ] 运行 Three 定向测试确认 GREEN。

### Task 3：Vue 桥接和两级树

- [ ] `EditorCanvas`/`EditorCanvasBridge` 暴露 `selectModelPart()`。
- [ ] `SceneTree` 去掉递归模型项构建，增加 `selectedModelPartId` 和 `select-model-part` 事件。
- [ ] `EditorWorkspace` 处理二级选择、普通选择清理和快照失效清理。
- [ ] 运行前端定向测试确认 GREEN。

### Task 4：实例名称格式

- [ ] `createAssetNode` 接收资源格式并生成 `${文件名}_${四位随机数}`。
- [ ] 双击添加和拖入视口都传递资源格式。
- [ ] 已经带扩展名或四位后缀时避免重复格式化。
- [ ] 旧场景使用素材真实格式和稳定节点 ID 补齐同款展示名称。
- [ ] 运行创建节点和工作区定向测试。

### Task 5：验证和真实模型验收

- [ ] 运行 Three、editor-web 定向测试和类型检查。
- [ ] 运行 `pnpm verify` 全量验证。
- [ ] 浏览器验证 Camera、固定两级、名称、二级 current 和 Mesh 精确包围盒。
- [ ] 检查 diff 中的中文注释和过期“递归树”描述后提交。
