# cj.glb 模型导入尺寸与明暗保真实施计划

**Goal:** 按 ThreeFlowX 4.0.4 在线源码恢复模型 Box3 归一化，使超大单位 GLB 在 Editor/Runtime 中以相同初始尺度和渲染基线显示。

**Architecture:** `AssetInstanceSystem` 继续负责模板缓存与实例生命周期；新增纯 Three.js 归一化模块，在克隆模板后建立业务根与内部 content 两层结构。EditorEngine 和 RuntimeThreeEngine 无需分别实现，避免两端再次漂移。

## Task 1：固定失败回归

- [x] 使用 `cj.glb` 实际包围盒尺寸写最大边 `1.5` 失败测试。
- [x] 写业务根 scale、阴影、小模型分母和空包围盒有限值测试。
- [x] 运行 `AssetInstanceSystem.test.ts`，确认测试因当前最大边仍为 `232.61` 而失败。

## Task 2：实现在线源码归一化

- [x] 新增 `createNormalizedModelInstance` 和线上常量。
- [x] 克隆模板后归一化内部 content，保持 SceneNode 根 scale 为 1。
- [x] 复现 Mesh 投射/接收阴影行为。
- [x] 保持共享几何资源和实例释放边界。

## Task 3：自动化与真实模型验收

- [x] 运行 Three Engine 窄测试、全量测试和类型检查。
- [x] 运行全仓 format、lint、typecheck、test、build。
- [x] 在隔离场景加载用户 `cj.glb`，核对 Editor 与 Runtime 统计和截图。
- [x] 删除临时验收项目，检查控制台与工作树。

## Task 4：交付

- [x] 复核 diff 和中文注释，确保没有顺手修改曝光、材质或灯光。
- [ ] 按仓库中文提交规范提交代码、测试与证据文档。
