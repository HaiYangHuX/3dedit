# 数字孪生 r183 项目渲染配置迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 数字孪生 r183 项目配置的全部枚举、真实默认值、内置资源和 Three.js 行为完整迁移到编辑器与发布运行时。

**Architecture:** SceneDocument 作为唯一可持久化配置源，`SceneSettingsSystem` 管理 renderer/背景/环境/雾，`GroundSystem` 管理九种地面，`WeatherSystem` 管理雨雪粒子。EditorEngine 和 RuntimeThreeEngine 共用三个系统与内置资源，UI 仍通过 `UpdateSceneSettingsCommand` 保持撤销、重做和显式保存。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Pinia 4、Element Plus 2.14、Three.js 0.183.0、Zod、Vitest、Playwright、Vite 7。

## Global Constraints

- Three.js runtime 以 `three@0.183.0` 为唯一 API 基准，不使用旧 skill 文档中 r126 特有写法。
- SceneDocument 继续使用 `schemaVersion: 1`，新字段由 Zod 以源站真实默认值补齐。
- 默认值固定为 Neutral、PCF、1.2、`#3b3b3b`、Venice HDR、FogExp2 0.01、Grid、无天气。
- `NoShadow` 映射 `BasicShadowMap`，但 `renderer.shadowMap.enabled` 始终为 `true`。
- 无背景显示 `#a0a0a0`，不启用透明 Canvas。
- 内置资源通过 `new URL(..., import.meta.url)` 打包，不引用 数字孪生 远程 URL。
- 更改不覆写导入模型原始材质参数，不以降低曝光掩盖 PBR 问题。
- 编辑器和发布运行时使用 Composer 作为唯一 Canvas 输出路径，不新建第二条 RAF。
- 新增注释使用中文，只解释资源所有权、异步代次、源站特殊行为和其他非显然约束。

---

### Task 1: SceneDocument 完整配置协议

**Files:**
- Modify: `packages/scene-schema/src/schema.ts`
- Modify: `packages/scene-schema/src/defaultDocument.ts`
- Modify: `packages/scene-schema/src/assetReferences.ts`
- Modify: `packages/scene-schema/tests/sceneDocument.test.ts`

**Interfaces:**
- Produces: `SceneDocument['settings']` 的完整强类型配置。
- Produces: `collectAssetReferences(document)` 同时收集 `backgroundAssetId` 和 `environmentAssetId`。

- [ ] **Step 1: 写入旧文档补齐、新建默认值和背景引用的失败测试**

  测试必须断言 23 个渲染字段的确切值，并用只包含四个旧设置字段的 schemaVersion 1 对象调用 `sceneDocumentSchema.parse` 验证自动补齐。

- [ ] **Step 2: 确认测试因缺少新字段而失败**

  Run: `pnpm --filter @digital-twin/scene-schema test`

  Expected: FAIL，新默认字段为 `undefined`，背景资源未进入引用列表。

- [ ] **Step 3: 用 Zod default 实现协议**

  类型枚举使用设计文档中的 kebab-case 值；数值同时设置合法范围与 `.default(...)`；`fogFar` 与 `fogNear` 的大小关系由 UI 保证，schema 保留可加载源站已存数据的能力。

- [ ] **Step 4: 运行窄测试与类型检查**

  Run: `pnpm --filter @digital-twin/scene-schema test && pnpm --filter @digital-twin/scene-schema typecheck`

  Expected: PASS，0 failures。

- [ ] **Step 5: 提交协议层**

  Run: `git add packages/scene-schema && git commit -m '💾 feat(场景协议): 补齐源站项目配置默认值'`

---

### Task 2: 内置渲染资源与可追溯清单

**Files:**
- Create: `packages/three-engine/src/settings/assets/*`
- Create: `packages/three-engine/src/settings/builtinAssets.ts`
- Create: `packages/three-engine/src/settings/assets/ASSET-SOURCES.md`
- Create: `packages/three-engine/tests/builtinAssets.test.ts`

**Interfaces:**
- Produces: `BUILTIN_ENVIRONMENT_URL`、`BUILTIN_ENVIRONMENT_PREVIEW_URL`、`GROUND_ASSETS`、`WEATHER_ASSETS`。

- [ ] **Step 1: 写入资源 URL 映射和 SHA-256 固定测试**

  测试读取地面图、法线图、草/花 GLB、雨雪精灵和 Venice HDR，以清单中的 SHA-256 比对，并断言运行时 URL 不含 `threeflowx.cn`。

- [ ] **Step 2: 确认测试因资源目录不存在而失败**

  Run: `pnpm --filter @digital-twin/three-engine test -- builtinAssets.test.ts`

  Expected: FAIL，无法导入 `builtinAssets.ts`。

- [ ] **Step 3: 复制已取证的源站资源**

  从 `/tmp/threeflowx-project-assets/` 复制 21 个地面/天气文件，从 `/tmp/threeflowx-view-hdr-1.hdr` 复制 Venice HDR，并生成小尺寸本地预览 JPG。

- [ ] **Step 4: 实现静态 URL 清单并记录源 URL、尺寸与哈希**

  `GROUND_ASSETS` 的 `floor/tile-1/tile-2/brick` 必须按源站实际 map/normal 配对，其中 tile-1 使用 `textures-1` 与源站的 `textures-normal-2`。

- [ ] **Step 5: 运行测试并提交**

  Run: `pnpm --filter @digital-twin/three-engine test -- builtinAssets.test.ts && git add packages/three-engine/src/settings packages/three-engine/tests/builtinAssets.test.ts && git commit -m '🎨 feat(Three资源): 内置源站地面与天气素材'`

---

### Task 3: Renderer、背景、环境与雾系统

**Files:**
- Modify: `packages/three-engine/src/settings/SceneSettingsSystem.ts`
- Modify: `packages/three-engine/tests/SceneSettingsSystem.test.ts`
- Modify: `packages/three-engine/src/assets/types.ts`

**Interfaces:**
- Consumes: `SceneDocument['settings']`、`AssetResolver`、内置 Venice Texture。
- Produces: `apply(settings)` 同步 renderer/fog；`applyBackground(settings, resolver)` 和 `applyEnvironment(settings, resolver)` 处理异步资源。

- [ ] **Step 1: 为全 tone mapping、shadow map、三种背景、环境开关和三种雾写失败测试**

  测试覆盖 `CustomToneMapping` 到 `NeutralToneMapping`、`BasicShadowMap` 到 `VSMShadowMap`、none 背景 `#a0a0a0`、图片背景的 sRGB/旋转/强度、environment disabled 显式置空及 Fog/FogExp2 参数。

- [ ] **Step 2: 确认旧系统无法满足新测试**

  Run: `pnpm --filter @digital-twin/three-engine test -- SceneSettingsSystem.test.ts`

  Expected: FAIL，旧 `apply` 只支持颜色、曝光和固定 FogExp2。

- [ ] **Step 3: 实现 r183 常量映射和异步资源所有权**

  背景与环境使用独立 generation token；新纹理加载失败时保留旧纹理；迟到纹理立即 dispose；自定义 JPG/PNG 环境设置 `EquirectangularReflectionMapping`，HDR 经 PMREM。

- [ ] **Step 4: 验证窄测试与 r183 类型**

  Run: `pnpm --filter @digital-twin/three-engine test -- SceneSettingsSystem.test.ts r183Compatibility.test.ts && pnpm --filter @digital-twin/three-engine typecheck`

  Expected: PASS，0 failures。

- [ ] **Step 5: 提交设置系统**

  Run: `git add packages/three-engine && git commit -m '✨ feat(Three设置): 还原源站渲染背景环境与雾'`

---

### Task 4: 九种地面系统

**Files:**
- Create: `packages/three-engine/src/settings/GroundSystem.ts`
- Create: `packages/three-engine/src/settings/groundShaders.ts`
- Create: `packages/three-engine/src/settings/disposeObjectTree.ts`
- Create: `packages/three-engine/tests/GroundSystem.test.ts`
- Modify: `packages/three-engine/src/index.ts`

**Interfaces:**
- Produces: `new GroundSystem(scene, options)`、`apply(type): Promise<void>`、`update(elapsed): void`、`dispose(): void`。

- [ ] **Step 1: 为 none/grid/贴图地面/lawn/rock/stone 写失败测试**

  断言 GridHelper 大小、分段、透明度和颜色；普通地面的 `1500×1500`、rotation、roughness 0.8、metalness 0.2、DoubleSide、repeat 1000；复杂地面的根名、类型和实例化对象；快速切换时迟到结果被释放。

- [ ] **Step 2: 确认测试因 `GroundSystem` 不存在而失败**

  Run: `pnpm --filter @digital-twin/three-engine test -- GroundSystem.test.ts`

  Expected: FAIL，导出不存在。

- [ ] **Step 3: 实现源站地面创建与释放**

  草坪保留 simplex patch 混合、25000 次候选/5000 可见草叶、每色 50 花朵候选与风摆 shader；岩石保留多尺度纹理、pebble/stone/boulder 分布；砂石保留涟漪和矿物微闪 shader。

- [ ] **Step 4: 验证创建、切换、风摆更新和 dispose**

  Run: `pnpm --filter @digital-twin/three-engine test -- GroundSystem.test.ts && pnpm --filter @digital-twin/three-engine typecheck`

  Expected: PASS，0 failures。

- [ ] **Step 5: 提交地面系统**

  Run: `git add packages/three-engine && git commit -m '🌿 feat(Three地面): 还原源站九种地面'`

---

### Task 5: 雨雪粒子系统

**Files:**
- Create: `packages/three-engine/src/settings/WeatherSystem.ts`
- Create: `packages/three-engine/tests/WeatherSystem.test.ts`
- Modify: `packages/three-engine/src/index.ts`

**Interfaces:**
- Produces: `new WeatherSystem(scene, options)`、`apply(settings)`、`update(delta, elapsed)`、`dispose()`。

- [ ] **Step 1: 为默认值、雨、雪、重建和清理写失败测试**

  断言 count 对应 BufferAttribute，PointsMaterial 参数与精灵纹理正确，雨沿固定风向旋转，雪使用双正弦漂移，粒子超出地面后回到 height，顶部和底部 15% 区域渐隐。

- [ ] **Step 2: 确认测试因系统不存在而失败**

  Run: `pnpm --filter @digital-twin/three-engine test -- WeatherSystem.test.ts`

  Expected: FAIL，导出不存在。

- [ ] **Step 3: 实现粒子创建和 Engine 驱动更新**

  用 `delta * 60` 将源站每帧速度换算为帧率无关更新；默认 rain windX/windZ 为 0.05/0.02，snow 为 0.02/0.01；不调用 `requestAnimationFrame`。

- [ ] **Step 4: 运行窄测试和类型检查**

  Run: `pnpm --filter @digital-twin/three-engine test -- WeatherSystem.test.ts && pnpm --filter @digital-twin/three-engine typecheck`

  Expected: PASS，0 failures。

- [ ] **Step 5: 提交天气系统**

  Run: `git add packages/three-engine && git commit -m '🌧️ feat(Three天气): 还原源站雨雪粒子'`

---

### Task 6: Editor/Runtime 共享完整项目配置

**Files:**
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/RuntimeThreeEngine.ts`
- Modify: `packages/three-engine/src/settings/loadEditorEnvironment.ts`
- Modify: `packages/three-engine/tests/loadEditorEnvironment.test.ts`
- Create: `packages/three-engine/tests/engineSettingsParity.test.ts`

**Interfaces:**
- Consumes: 三个 settings system 及内置 Venice URL。
- Produces: 编辑器与运行时相同的 `loadDocument`/`updateSettings` 渲染结果。

- [ ] **Step 1: 写入双引擎默认 Venice、Neutral/PCF 和更新链的失败测试**

  静态兼容测试禁止 Runtime 使用 ACES 旧默认，并要求双引擎均创建 Ground/Weather，loop 中更新而不新建 RAF。

- [ ] **Step 2: 确认运行时视觉不一致测试失败**

  Run: `pnpm --filter @digital-twin/three-engine test -- engineSettingsParity.test.ts`

  Expected: FAIL，Runtime 仍使用 ACES，且无默认 HDR/地面/天气。

- [ ] **Step 3: 实现双引擎一致的初始化、更新和释放顺序**

  Runtime 使用内置 Venice，异常时同样回退 RoomEnvironment；`loadDocument` 等待背景/环境/地面完成；loop 每帧更新 weather 和 lawn shader；dispose 令迟到资源失效后再销毁 renderer。

- [ ] **Step 4: 运行 Three Engine 全量测试与类型检查**

  Run: `pnpm --filter @digital-twin/three-engine test && pnpm --filter @digital-twin/three-engine typecheck`

  Expected: PASS，0 failures。

- [ ] **Step 5: 提交引擎集成**

  Run: `git add packages/three-engine && git commit -m '♻️ refactor(Three引擎): 统一编辑与发布渲染配置'`

---

### Task 7: 源站项目配置 UI 与素材库上传

**Files:**
- Rewrite: `apps/editor-web/src/components/editor/SceneSettingsInspector.vue`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/components/editor/ViewportToolbar.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Create: `apps/editor-web/tests/SceneSettingsInspector.test.ts`
- Modify: `apps/editor-web/tests/EditorWorkspace.test.ts`
- Modify: `apps/editor-web/tests/ViewportChrome.test.ts`

**Interfaces:**
- SceneSettingsInspector props: `settings`、`assets`、`uploading`、`builtinEnvironmentPreviewUrl`。
- SceneSettingsInspector emits: `update(patch)`、`upload-background(file)`、`upload-environment(file)`。

- [ ] **Step 1: 为四个分组、全部枚举、精确范围和条件字段写失败测试**

  测试分别设置 texture/Fog/FogExp2/rain/snow，验证应显示字段与应隐藏字段；还要断言默认 Venice 预览、accept `image/jpeg,image/png,.hdr`、以及控件 commit 的 patch 字段。

- [ ] **Step 2: 确认旧四字段面板无法满足测试**

  Run: `pnpm --filter @digital-twin/editor-web test -- SceneSettingsInspector.test.ts`

  Expected: FAIL，缺少分组、枚举、条件字段和上传。

- [ ] **Step 3: 用 Element Plus 实现源站结构与默认显示**

  Select 、InputNumber、Slider 和 ColorPicker 的 min/max/step 严格按设计文档；仅在 change/commit 事件发送命令，避免拖动 slider 每帧污染历史栈。

- [ ] **Step 4: 复用 `assetStore.uploadFile` 实现背景/环境上传**

  工作区验证文件扩展名，调用现有 hash → multipart → worker 链，等待 ready 后以 task.assetId 执行 `updateSceneSettings`；失败只提示错误，不提前写 SceneDocument。

- [ ] **Step 5: 使视口网格按钮映射 `groundType`**

  开启时提交 `{ groundType: 'grid', gridVisible: true }`，关闭时提交 `{ groundType: 'none', gridVisible: false }`；当 lawn/rock/贴图地面生效时按钮显示非激活。

- [ ] **Step 6: 运行 UI 测试、类型检查和构建**

  Run: `pnpm --filter @digital-twin/editor-web test && pnpm --filter @digital-twin/editor-web typecheck && pnpm --filter @digital-twin/editor-web build`

  Expected: PASS，0 failures。

- [ ] **Step 7: 提交项目配置面板**

  Run: `git add apps/editor-web && git commit -m '✨ feat(项目配置): 迁移源站完整设置面板'`

---

### Task 8: 全量回归与可视化验收

**Files:**
- Modify: `tests/editor.spec.ts`
- Modify: `tests/runtime.spec.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-17-project-render-settings-parity-design.md` only if implementation evidence requires clarifying an already implemented contract

**Interfaces:**
- Produces: 可重复的编辑器/运行时验收用例和资源说明。

- [ ] **Step 1: 补充保存、刷新、预览和发布配置保真的 E2E 断言**

  用一个新场景切换 floor、Fog、rain，保存后刷新，断言 UI 值恢复；发布 manifest 中同时存在背景/环境资源引用。

- [ ] **Step 2: 运行完整验证链**

  Run: `PATH='/opt/homebrew/Cellar/node@24/24.18.0/bin':$PATH pnpm verify`

  Expected: format、lint、typecheck、unit tests、build、Playwright 全部 PASS。

- [ ] **Step 3: 启动服务并在真实浏览器验收**

  验收 `http://127.0.0.1:5173`、`http://127.0.0.1:5174`和 API `3100`；逐项切换 tone mapping、shadow、background、environment、fog、9 种地面和 3 种天气，检查 console/network 无错误。

- [ ] **Step 4: 用 DEVICE-4x1装配区-114 对照视觉基准**

  默认 Neutral + PCF + 1.2 + Venice + FogExp2 0.01 下检查金属感、暗部和高光；切换 Floor 后检查颜色纹理和法线细节；编辑器与发布端截图不应出现色调或环境差异。

- [ ] **Step 5: 检查差异、注释和工作树并提交验收变更**

  Run: `git diff --check && git status --short && git add tests README.md docs && git commit -m '✅ test(项目配置): 补充编辑发布一致性验收'`
