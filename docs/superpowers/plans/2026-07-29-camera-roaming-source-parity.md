# 相机漫游源站一致性重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复漫游取点偏移，并按 ThreeFlowX 4.0.4 完整迁移路径速度、悬停显示、点位编辑及起终点视觉。

**Architecture:** `CameraRoamingSystem` 使用源站地面投影算法并分别拥有 drawing/hover/preview 三个视觉组；`CameraRoamingPath.speed` 由 Scene Schema 保存；Vue 面板只发出业务事件，坐标与视觉对象仍由 Engine 拥有。

**Tech Stack:** Vue 3、TypeScript 5.9、Pinia、Element Plus、Three.js 0.183.0、Zod、Vitest。

## Global Constraints

- Three.js runtime 固定为 `0.183.0`，不升级依赖。
- 新建路径默认速度 `4`，可编辑范围 `0.1 ~ 50`。
- 取点只投影到世界 `Y=0`，点位常规高度 `0.55`，播放相机相对点位增加 `1.4`。
- 点击阈值为 `250ms/5px`，最短分段播放时间 `400ms`，末段转向从 `80%` 开始。
- 保留稳定路径 ID、命令撤销/重做和显式保存。
- 新增/变更的非显然逻辑使用简洁中文注释。
- 不覆盖或提交现有 `.gitignore`、macOS 启停脚本和其计划文档改动。

---

### Task 1: 路径速度数据协议

**Files:**
- Modify: `packages/scene-schema/src/camera.ts`
- Modify: `packages/scene-schema/tests/sceneDocument.test.ts`
- Modify: 所有编译期间正确创建 `CameraRoamingPath` 的测试 fixture

**Interfaces:**
- Produces: `CameraRoamingPath.speed: number`
- Default: `4`
- Validation: `min(0.1).max(50)`

- [ ] 在 Scene Schema 测试中加入旧路径缺省速度补齐和非法速度拒绝断言。
- [ ] 运行 `pnpm --filter @digital-twin/scene-schema test`，确认旧实现 RED。
- [ ] 在 `cameraRoamingPathSchema` 增加 `speed: z.number().min(0.1).max(50).default(4)`。
- [ ] 为所有 TypeScript fixture 显式补齐 `speed: 4`，新建业务路径不依赖隐式 parse。
- [ ] 运行 Scene Schema 测试与全局 TypeScript 检查，确认 GREEN。

### Task 2: 源站取点投影与可配置播放速度

**Files:**
- Modify: `packages/three-engine/tests/CameraRoamingSystem.test.ts`
- Modify: `packages/three-engine/src/camera/CameraRoamingSystem.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`

**Interfaces:**
- Remove: `CameraRoamingSystemOptions.getSurfaceRoot`
- Consume: `CameraRoamingPath.speed`

- [ ] 写失败测试：画布存在 left/top 偏移时中心点投影正确，高台 Mesh 不参与取点，超过最大距离时仍产生截断点。
- [ ] 写失败测试：相同距离使用 `speed: 2` 时进度为 `speed: 4` 的一半。
- [ ] 运行 `pnpm --filter @digital-twin/three-engine exec vitest run tests/CameraRoamingSystem.test.ts`，确认 RED。
- [ ] 移除表面射线、法线矩阵、InstancedMesh 分支及 `EditorEngine` 的 `getSurfaceRoot` 装配。
- [ ] 实现地面平面求交、无交点前方回退、远距离射线截断和 `0.5 + 0.05` 点位高度。
- [ ] 播放状态保存当前路径速度，分段时长使用 `distance / speed`。
- [ ] 运行目标测试和 Three Engine typecheck，确认 GREEN。

### Task 3: 悬停/播放/绘制视觉层和起终点标记

**Files:**
- Modify: `packages/three-engine/tests/CameraRoamingSystem.test.ts`
- Modify: `packages/three-engine/src/camera/CameraRoamingSystem.ts`
- Modify: `packages/three-engine/tests/EditorEngineCamera.test.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`

**Interfaces:**
- Produces: `showHoverPath(path: CameraRoamingPath): boolean`
- Produces: `hideHoverPath(): void`
- Produces: `EditorEngine.showCameraRoamingPath(pathId: string): boolean`
- Produces: `EditorEngine.hideCameraRoamingPath(): void`

- [ ] 写失败测试：悬停路径加入 Scene，离开后释放，播放前清理悬停层。
- [ ] 写失败测试：三点路径派生 `start/waypoint/end`，首尾标签分别为 `S/E`。
- [ ] 运行目标测试确认 RED。
- [ ] 将单一 `visualGroup` 拆为 drawing/hover/preview 三个独立所有者，实现对称释放。
- [ ] 按源站颜色、尺寸和材质构建底部光圈、立柱、八面体核心、线框壳和编号 Sprite。
- [ ] 按源站构建三层轨迹和段中方向锥体。
- [ ] 实现 Engine 的稳定 ID 包装，替换路径列表时清理悬停层。
- [ ] 运行 CameraRoamingSystem/EditorEngineCamera 测试和 typecheck，确认 GREEN。

### Task 4: Vue 漫游面板一比一迁移

**Files:**
- Modify: `apps/editor-web/tests/CameraInspector.test.ts`
- Modify: `apps/editor-web/tests/EditorCanvasBridge.test.ts`
- Modify: `apps/editor-web/tests/EditorWorkspace.test.ts`
- Modify: `apps/editor-web/src/components/editor/CameraRoamingPanel.vue`
- Modify: `apps/editor-web/src/components/editor/CameraInspector.vue`
- Modify: `apps/editor-web/src/components/EditorCanvas.vue`
- Modify: `apps/editor-web/src/editor/useEditorCommands.ts`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`

**Interfaces:**
- Panel emits: `hover(pathId)` / `leave()` / `update-speed(pathId, speed)` / `update-points(pathId, points)`
- Canvas bridge: `showCameraRoamingPath(pathId)` / `hideCameraRoamingPath()`

- [ ] 写失败组件测试：卡片显示速度、鼠标经过/离开发出事件，速度变更发出有限值。
- [ ] 写失败组件测试：点位编辑弹窗保存三维 tuple，少于两点或非有限数时不提交。
- [ ] 写失败桥接/工作区测试：悬停方法转发到 Engine，速度/点位更新调用 `replaceCameraRoamingList`，新建路径含 `speed: 4`。
- [ ] 运行目标 Vue 测试确认 RED。
- [ ] 用 Element Plus `ElInputNumber/ElTooltip/ElDialog/ElTable/ElScrollbar` 和官方图标实现源站面板。
- [ ] 加入局部编辑草稿，不直接修改 props；保存后一次发出 tuple 列表。
- [ ] 完成 CameraInspector → Workspace → Commands → Canvas → Engine 事件链。
- [ ] 按源站 `cr-*` CSS 迁移密度、颜色、滚动条、激活态和按钮交互。
- [ ] 运行目标 Vue 测试、Editor Web typecheck 与 stylelint，确认 GREEN。

### Task 5: 回归与浏览器验收

- [ ] 运行 Prettier check、ESLint、Stylelint、Scene Schema/Editor Core/Three Engine/Editor Web 测试与 typecheck。
- [ ] 运行前后端生产构建，确认 Three.js r183 导入和 API 全部有效。
- [ ] 启动本地 API、Worker、Editor 和 Runtime，检查 `/api/health`。
- [ ] 在浏览器完成设计文档中的六项源站对照验收。
- [ ] 检查 `git diff --check` 和 `git status --short`，确认现有 macOS 脚本改动未被覆盖。
