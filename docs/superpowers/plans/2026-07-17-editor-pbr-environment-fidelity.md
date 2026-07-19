# 编辑器 PBR 环境与选中态保真实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Three.js r183 官方 Venice HDR 和黄色 BoxHelper 复现 数字孪生 的默认模型质感，同时完整管理异步纹理、PMREM 与选择辅助资源。

**Architecture:** `EditorEngine` 负责默认编辑环境的初始化与兜底 target，`SceneSettingsSystem` 继续负责默认/用户 HDR 切换；新增小型 `SelectionBoxSystem` 将选中反馈从后处理通道移出。Vue、SceneDocument 和 RuntimeThreeEngine 的发布语义保持不变。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Three.js `0.183.0`、`@types/three@0.183.1`、Vitest、Playwright、Vite 7。

## Global Constraints

- Three.js runtime `0.183.0` 是 API 最终权威。
- 不修改 GLTF 原始 `color`、`metalness`、`roughness` 或贴图。
- 编辑器 Composer 仍是每帧唯一最终画布输出路径。
- 默认 HDR、网格和 BoxHelper 只属于编辑器，不写入 SceneDocument 或发布运行时。
- 用户 HDR 清除后必须恢复默认 Venice 环境。
- 新增非显然逻辑使用有效中文注释，并对称释放 Texture、PMREM target、Generator、geometry 和 material。

---

### Task 1: 固化默认 HDR 环境回归边界

**Files:**
- Create: `packages/three-engine/src/settings/loadEditorEnvironment.ts`
- Create: `packages/three-engine/tests/loadEditorEnvironment.test.ts`
- Modify: `packages/three-engine/tests/r183Compatibility.test.ts`
- Modify: `packages/three-engine/tests/SceneSettingsSystem.test.ts`

**Interfaces:**
- `loadEditorEnvironment(url, loader, generator, isStale): Promise<EnvironmentMapTarget | undefined>`
- `DEFAULT_EDITOR_ENVIRONMENT_URL: '/hdr/venice_sunset_1k.hdr'`
- `EDITOR_ENVIRONMENT_ROTATION_Y: Math.PI / 2`

- [ ] **Step 1: 写失败测试**

新增测试断言指定 URL 经 HDRLoader 进入 PMREM、源纹理始终释放、迟到加载不触碰 Generator，并将 r183 兼容断言从 RoomEnvironment 主路径改成 Venice HDR、环境旋转和本地 URL。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --filter @digital-twin/three-engine test -- loadEditorEnvironment.test.ts r183Compatibility.test.ts
```

Expected: FAIL，加载模块与默认 URL 尚不存在，兼容测试仍发现 RoomEnvironment 主路径。

- [ ] **Step 3: 写最小加载实现**

实现单一异步加载函数：等待 Texture，检查失效代次，调用 `fromEquirectangular`，并用 `finally` 释放源 Texture。

- [ ] **Step 4: 运行窄测试确认通过**

```bash
pnpm --filter @digital-twin/three-engine test -- loadEditorEnvironment.test.ts r183Compatibility.test.ts SceneSettingsSystem.test.ts
```

Expected: PASS。

---

### Task 2: 替换默认 IBL 并交付本地环境资源

**Files:**
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/index.ts`
- Create: `apps/editor-web/public/hdr/venice_sunset_1k.hdr`
- Create: `apps/editor-web/public/hdr/README.md`
- Modify: `apps/editor-web/tests/EditorCanvasBridge.test.ts`

**Interfaces:**
- `EditorEngineOptions.defaultEnvironmentUrl?: string | null`
- `new EditorEngine()` 默认读取 `/hdr/venice_sunset_1k.hdr`。

- [ ] **Step 1: 写 Engine/静态资源失败断言**

断言 EditorEngine 默认 URL、Y 轴旋转、初始化等待异步环境，以及本地 HDR 的精确 SHA-256；断言 RuntimeThreeEngine 没有默认 HDR 注入。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --filter @digital-twin/three-engine test
pnpm --filter @digital-twin/editor-web test -- EditorCanvasBridge.test.ts
```

Expected: FAIL，当前主路径仍为 RoomEnvironment，静态 HDR 不存在。

- [ ] **Step 3: 实现 HDR 主路径和 Room 兜底**

EditorEngine 创建 Generator 后等待默认 HDR；只有加载失败时才从 RoomEnvironment 生成兜底。卸载代次阻止迟到纹理使用已销毁 Renderer。设置 `scene.environmentRotation.y = Math.PI / 2`，再创建 SceneSettingsSystem。

- [ ] **Step 4: 复制并记录官方资源**

复制已核对的 Three.js r183 `venice_sunset_1k.hdr`，README 记录官方来源、MIT 归属和 SHA-256，避免未来被无意替换为不同光照环境。

- [ ] **Step 5: 验证 Task 2**

```bash
shasum -a 256 apps/editor-web/public/hdr/venice_sunset_1k.hdr
pnpm --filter @digital-twin/three-engine test
pnpm --filter @digital-twin/three-engine typecheck
pnpm --filter @digital-twin/editor-web build
```

Expected: 哈希为 `0e72ed46b5316cb5fb67fc81ff85b024a09146fd89ef3811a8d2299647ada118`，其余命令 PASS。

---

### Task 3: 用 BoxHelper 替换编辑器白色 Outline

**Files:**
- Create: `packages/three-engine/src/interaction/SelectionBoxSystem.ts`
- Create: `packages/three-engine/tests/SelectionBoxSystem.test.ts`
- Modify: `packages/three-engine/src/interaction/SelectionSystem.ts`
- Modify: `packages/three-engine/tests/SelectionSystem.test.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/index.ts`
- Modify: `packages/three-engine/tests/r183Compatibility.test.ts`

**Interfaces:**
- `SelectionHighlightTarget.setObjects(objects: Object3D[]): void`
- `SelectionHighlightTarget.clear(): void`
- `SelectionBoxSystem.update(): void`
- `SelectionBoxSystem.dispose(): void`

- [ ] **Step 1: 写黄色包围盒失败测试**

覆盖单选/多选黄色 `BoxHelper`、对象变换后的几何更新、相同 ID 对象重建后的 target 刷新、换选和 dispose 的资源释放。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --filter @digital-twin/three-engine test -- SelectionBoxSystem.test.ts SelectionSystem.test.ts r183Compatibility.test.ts
```

Expected: FAIL，SelectionBoxSystem 不存在且编辑器仍包含 OutlinePass。

- [ ] **Step 3: 实现选择辅助系统并接入 Engine**

SelectionSystem 只向抽象 highlight target 同步业务根对象；SelectionBoxSystem 创建黄色 helper 并拥有其资源。EditorEngine 的 Composer 改为 `RenderPass -> OutputPass`，在每次有效渲染前更新 helper；Runtime Outline 保持原样。

- [ ] **Step 4: 运行窄测试与类型检查**

```bash
pnpm --filter @digital-twin/three-engine test -- SelectionBoxSystem.test.ts SelectionSystem.test.ts r183Compatibility.test.ts
pnpm --filter @digital-twin/three-engine typecheck
```

Expected: PASS。

---

### Task 4: 同模型 WebGL 验收与全量回归

**Files:**
- Modify: `README.md`
- Modify: `tests/e2e/editor-foundation.spec.ts`（仅在需要稳定新回归断言时）

**Interfaces:**
- 编辑器 `data-engine-ready=true` 表示默认 HDR 与文档均已加载。
- Runtime 行为和发布文档结构不变。

- [ ] **Step 1: 运行全量静态与自动化验证**

```bash
pnpm verify
git diff --check
```

Expected: format、Lint、typecheck、169+ 单元测试、全量构建和 Playwright 全部 PASS。

- [ ] **Step 2: 启动并执行真实视觉验收**

在 1280×720 浏览器中打开隔离场景，只添加 `DEVICE-4x1装配区-114.glb`；分别取消和恢复选中，截图检查白色底座、黄色机械臂、深色钢件与选中前后材质一致性，并确认 console error 为 0。

- [ ] **Step 3: 清理诊断数据并更新说明**

删除临时隔离项目，README 记录默认 HDR、用户 HDR 替换规则、RoomEnvironment 仅兜底及本地启动方法。

- [ ] **Step 4: 最终提交**

按仓库中文提交规范拆分测试、实现与文档提交，最终确认工作树干净。
