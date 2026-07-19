# 项目管理与模型素材库产品化重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目管理和模型/素材库升级为后台式产品，支持完整元数据、封面、版本历史、弹窗添加和独立 3D 详情预览。

**Architecture:** 继续使用 NestJS + Prisma + Zod contracts + Vue3/Pinia/Element Plus。后端扩展项目/Asset DTO 并增加 AssetVersion 关系；前端用 ManagementLayout 统一后台导航，业务页面拆分项目表单、资源创建表单和资源预览 Canvas。编辑器、发布和已有分片上传协议保持边界不变。

**Tech Stack:** Vue 3, TypeScript, Pinia, Element Plus, NestJS, Prisma/PostgreSQL, MinIO, Three.js 0.183.0, GLTFLoader/DRACOLoader。

## Global Constraints

- Three.js 运行时固定为 `0.183.0`，必须使用 `three/addons/...` 当前导入路径。
- 不引入登录、账号或权限服务；责任人和可见性先作为普通字段保存。
- 上传仍使用 SHA-256 + 5 MiB 分片直传 MinIO，Worker 解析任务协议不能破坏。
- 所有用户可见输入使用 Element Plus，公共输入框不设置特殊超大尺寸。
- 代码中的非显然业务规则、异步生命周期和资源释放逻辑必须添加中文维护注释。
- 每个任务完成后运行对应窄测试，再继续下一任务。

---

### Task 1: 扩展共享契约与 Prisma 数据模型

**Files:**
- Modify: `packages/api-contracts/src/project.ts`
- Modify: `packages/api-contracts/src/asset.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Modify: `apps/api-server/prisma/schema.prisma`
- Create: `apps/api-server/prisma/migrations/0004_management_asset_productization/migration.sql`
- Test: `packages/api-contracts/tests/*.test.ts` (新增专门契约测试)

**Interfaces:**
- Produces `ProjectStatus`, `AssetVisibility`, `AssetVersionStatus` 字面量类型。
- Produces `CreateProjectInput/UpdateProjectInput` 的 code/status/tags/ownerName/industry/location/notes 字段。
- Produces `CreateUploadRequest/UpdateAssetInput/Asset/AssetDetail` 的资源元数据、coverUrl、versions 字段。

- [ ] **Step 1: Write failing schema tests**
  - 覆盖默认项目字段、版本号 `major.minor.patch`、标签上限、visibility/status 枚举、资源版本响应和 coverUrl nullable。
- [ ] **Step 2: Run contract tests and verify failure**
  - Run: `pnpm --filter @digital-twin/api-contracts test`
  - Expected: 新字段解析/导出断言失败。
- [ ] **Step 3: Extend Zod contracts and Prisma schema**
  - Prisma `Project` 增加 `code/status/tags/ownerName/industry/location/notes`。
  - Prisma `Asset` 增加 `code/description/version/versionNotes/author/manufacturer/license/unit/scale/visibility/coverAssetId` 和自关联 `coverAsset/coveredAssets`。
  - 新增 `AssetVersion`，`@@unique([assetId, version])`，保存 sourceFileId、metadata、notes、status、publishedAt。
  - 上传 DTO 增加对应可选字段，保持旧调用默认值。
- [ ] **Step 4: Add migration SQL**
  - 为新增列写 `ALTER TABLE ... ADD COLUMN ... DEFAULT ... NOT NULL`。
  - 创建 `AssetVersion` 表、唯一索引和外键；coverAssetId 使用 `ON DELETE SET NULL`。
- [ ] **Step 5: Run tests and Prisma generation**
  - Run: `pnpm --filter @digital-twin/api-contracts test && pnpm --filter @digital-twin/api-server exec prisma generate && pnpm --filter @digital-twin/api-server typecheck`
  - Expected: PASS。

### Task 2: 项目后端产品字段与统计接口

**Files:**
- Modify: `apps/api-server/src/projects/project.service.ts`
- Modify: `apps/api-server/src/projects/project.controller.ts`
- Modify: `apps/api-server/src/scenes/scene.service.ts` (更新项目汇总时使用新字段)
- Modify: `apps/api-server/tests/project.service.test.ts`
- Modify: `apps/api-server/tests/scene.service.test.ts`

**Interfaces:**
- `ProjectSummary` 返回 `code/status/tags/ownerName/industry/location/notes/assetCount/lastPublishedAt`。
- `ProjectService.mapProjectDetail` 继续返回 scenes，并通过文档 assetReferences 计算项目资源引用数量。

- [ ] **Step 1: Add failing service assertions**
- [ ] **Step 2: Implement DTO mapping and project filters**
  - 项目列表 keyword 同时匹配 name、code、description、tags。
  - 详情统计引用过的 Asset 去重计数；发布状态和 publishedAt 从 Publication 读取。
  - create/copy/update 透传新字段并保持旧默认。
- [ ] **Step 3: Run project service tests**
  - Run: `pnpm --filter @digital-twin/api-server exec vitest run tests/project.service.test.ts tests/scene.service.test.ts`
  - Expected: PASS。

### Task 3: 资源上传元数据与版本历史后端

**Files:**
- Modify: `apps/api-server/src/uploads/upload.service.ts`
- Modify: `apps/api-server/src/assets/asset.service.ts`
- Modify: `apps/api-server/src/assets/asset.controller.ts`
- Modify: `apps/asset-worker/src/infrastructure.ts`
- Modify: `apps/api-server/tests/upload.service.test.ts`
- Modify: `apps/api-server/tests/asset.service.test.ts`
- Modify: `apps/asset-worker/tests/glb.test.ts`

**Interfaces:**
- `CreateUploadRequest` 的业务字段写入新 Asset 或替换上传的 Asset。
- 首次 complete 创建 `AssetVersion`；替换上传创建新版本并将 version/versionNotes 写到 Asset。
- `AssetDetail.versions` 按 createdAt 倒序返回，`coverUrl` 优先封面素材的 thumbnailUrl，否则当前解析 thumbnailUrl。

- [ ] **Step 1: Add failing upload/version tests**
  - 验证首次上传创建 `1.0.0` 版本；显式版本号保留；替换上传不删除旧 AssetFile；coverAssetId 映射可空。
- [ ] **Step 2: Implement upload transaction changes**
  - `AssetVersion` 与 source `AssetFile` 在同一 Prisma transaction 创建。
  - 重试任务只更新对应激活版本状态，不修改历史版本。
- [ ] **Step 3: Implement asset detail/list mapping**
  - include `versions` 与 `coverAsset`；presign cover thumbnail/source。
  - 增加 code/visibility/version/category/status filters。
- [ ] **Step 4: Run API/worker tests**
  - Run: `pnpm --filter @digital-twin/api-server test && pnpm --filter @digital-twin/asset-worker test`
  - Expected: PASS。

### Task 4: 后台布局与项目页面重构

**Files:**
- Create: `apps/editor-web/src/layouts/ManagementLayout.vue`
- Create: `apps/editor-web/src/components/ProjectFormDialog.vue`
- Modify: `apps/editor-web/src/router.ts`
- Modify: `apps/editor-web/src/views/ProjectsView.vue`
- Modify: `apps/editor-web/src/views/ProjectDetailView.vue`
- Modify: `apps/editor-web/src/stores/project.ts`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Test: `apps/editor-web/tests/ManagementLayout.test.ts`
- Modify: `apps/editor-web/tests/ProjectsView.test.ts`
- Modify: `apps/editor-web/tests/ProjectDetailView.test.ts`

**Interfaces:**
- `ManagementLayout` 只渲染 sidebar/header/`<RouterView />`，不直接请求 API。
- Project store 提供 `updateProject` 全字段、scene rename/default scene 操作。

- [ ] **Step 1: Add failing layout/navigation tests**
- [ ] **Step 2: Implement nested management routes**
  - `/projects`, `/projects/:projectId`, `/assets` 放到 layout children；`/editor/...` 保持全屏独立路由。
- [ ] **Step 3: Implement project overview**
  - 顶部统计、搜索、状态筛选、卡片/表格切换、创建项目弹窗、复制/归档/删除确认。
  - 封面为空使用渐变首字母占位，保持暗色控制台主题。
- [ ] **Step 4: Implement project detail workspace**
  - 项目摘要、项目设置表单、场景列表、创建/复制/重命名/删除/默认场景和进入编辑器。
- [ ] **Step 5: Run editor component tests**
  - Run: `pnpm --filter @digital-twin/editor-web test -- ProjectsView ProjectDetailView ManagementLayout`
  - Expected: PASS。

### Task 5: Pinia 资源创建流程与弹窗表单

**Files:**
- Create: `apps/editor-web/src/components/AssetCreateDialog.vue`
- Modify: `apps/editor-web/src/stores/asset.ts`
- Modify: `apps/editor-web/src/api/assets.ts`
- Modify: `apps/editor-web/src/views/AssetsView.vue`
- Modify: `apps/editor-web/src/components/AssetLibraryPanel.vue`
- Modify: `apps/editor-web/tests/assetStore.test.ts`
- Create: `apps/editor-web/tests/AssetCreateDialog.test.ts`

**Interfaces:**
- `AssetCreateDialog` emits `created` and owns form validation/file selection，不持有 Three 实例。
- `useAssetStore.uploadFile(file, options)` 支持 name/code/version/versionNotes/coverAssetId 等字段，返回 UploadTask.assetId。

- [ ] **Step 1: Add failing form/store tests**
  - 验证模型文件必填、封面可选、封面先上传再关联、版本默认 `1.0.0`、关闭任务抽屉不取消上传。
- [ ] **Step 2: Extend upload API/store options**
- [ ] **Step 3: Implement Element Plus wide dialog**
  - 分组字段：基本信息、版本来源、文件；统一公共输入尺寸；封面预览和“使用解析缩略图”提示。
- [ ] **Step 4: Remove direct page Dropzone**
  - AssetsView 只保留“添加资源”按钮、任务入口、筛选栏和列表；编辑器模型库保留拖拽能力但不负责上传。
- [ ] **Step 5: Run asset component/store tests**
  - Run: `pnpm --filter @digital-twin/editor-web test -- assetStore AssetCreateDialog AssetLibraryPanel AssetsView`
  - Expected: PASS。

### Task 6: 资产详情 3D 预览与版本面板

**Files:**
- Create: `apps/editor-web/src/components/AssetPreviewCanvas.vue`
- Create: `apps/editor-web/src/components/AssetVersionTimeline.vue`
- Modify: `apps/editor-web/src/views/AssetsView.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Create: `apps/editor-web/tests/AssetPreviewCanvas.test.ts`

**Interfaces:**
- `AssetPreviewCanvas` props: `{ asset: AssetDetail; visible: boolean }`，emits `loaded/error`。
- Canvas 内部用当前 r183 `GLTFLoader`/`DRACOLoader`，以 `Box3.setFromObject` 自动取景；onBeforeUnmount 对称清理。

- [ ] **Step 1: Add failing preview lifecycle test**
- [ ] **Step 2: Implement loader/renderer/controls lifecycle**
  - 仅加载 model kind；图片/视频详情使用现有预览。
  - 自动环境光、网格和重置按钮；错误时显示可读状态。
- [ ] **Step 3: Implement version timeline**
  - 当前版本突出显示，历史版本展示版本号、状态、说明、时间和源文件下载。
- [ ] **Step 4: Integrate drawer and test**
  - 详情抽屉从窄栏升级为宽屏双栏：左 3D、右 metadata/version/files。

### Task 7: 端到端验收与文档

**Files:**
- Modify: `tests/e2e/project-scene.spec.ts`
- Modify: `tests/e2e/scene-editing.spec.ts`
- Create: `tests/e2e/management-assets.spec.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-18-management-and-asset-library-product-design.md`

- [ ] **Step 1: Add E2E flow**
  - 创建项目并编辑元数据；打开素材库；添加 GLB + 封面；等待 ready；打开详情验证 Canvas；验证版本历史；从编辑器模型库拖入该模型。
- [ ] **Step 2: Run focused E2E**
  - Run: `pnpm exec playwright test tests/e2e/management-assets.spec.ts tests/e2e/project-scene.spec.ts`
  - Expected: PASS。
- [ ] **Step 3: Run full verification**
  - Run: `pnpm verify`
  - Expected: format/lint/typecheck/unit/build pass；记录任何与本次无关的环境超时。
- [ ] **Step 4: Review diff and remove temporary diagnostics**
  - Run: `git diff --check` and search for `TODO`, `临时诊断`, `__debug`。

