# 项目场景表单同步与编辑器返回 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让项目创建/编辑共享完整封面上传字段，场景创建/编辑支持描述，并在编辑器提供返回项目入口。

**Architecture:** 封面沿用资源上传队列，表单只在提交时上传并把最终 URL 作为 `coverKey` 写入项目或场景；场景描述作为 Scene 元数据字段独立于 Three.js 文档。编辑器通过当前路由参数返回项目详情，不触发保存。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、NestJS、Prisma、PostgreSQL、Zod。

## Global Constraints

- Three.js 版本保持 r183。
- 场景文档仍仅点击“保存”才提交。
- 不引入登录、权限或兼容性分支。
- 保留现有中文注释风格，并仅修改本需求相关文件。

### Task 1: 扩展项目/场景 API 与数据库

**Files:**
- Modify: `packages/api-contracts/src/project.ts`
- Modify: `packages/api-contracts/src/scene.ts`
- Modify: `apps/api-server/prisma/schema.prisma`
- Create: `apps/api-server/prisma/migrations/0008_scene_description/migration.sql`
- Modify: `apps/api-server/src/projects/project.service.ts`
- Modify: `apps/api-server/src/scenes/scene.service.ts`

- [ ] 增加项目创建 `coverKey`、场景 `description` 的校验与 DTO 映射。
- [ ] 为 Scene 增加非空默认描述字段并复制/创建/更新时持久化。
- [ ] 生成迁移 `ALTER TABLE "Scene" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';`。

### Task 2: 统一项目表单并接入图片上传

**Files:**
- Modify: `apps/editor-web/src/components/ProjectFormDialog.vue`
- Modify: `apps/editor-web/src/views/ProjectDetailView.vue`
- Modify: `apps/editor-web/src/views/ProjectsView.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`

- [ ] 创建与编辑使用相同字段和封面上传控件。
- [ ] 沿用 `useAssetStore().uploadFile`，上传后从 Asset DTO 取 `coverUrl`/`thumbnailUrl`。
- [ ] 列表和项目详情 Hero 渲染已保存封面。

### Task 3: 补齐场景描述与编辑器返回项目

**Files:**
- Modify: `apps/editor-web/src/components/SceneFormDialog.vue`
- Modify: `apps/editor-web/src/stores/project.ts`
- Modify: `apps/editor-web/src/views/ProjectDetailView.vue`
- Modify: `apps/editor-web/src/components/editor/EditorTopBar.vue`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`

- [ ] 场景创建/编辑表单加入描述文本域并回填。
- [ ] 场景卡片显示描述，没有描述时显示简洁默认提示。
- [ ] 顶部新增返回项目按钮，路由至 `/projects/:projectId`。

### Task 4: 回归验证

**Files:**
- Modify: `apps/editor-web/tests/SceneFormDialog.test.ts`
- Modify: `apps/editor-web/tests/ProjectDetailView.test.ts`
- Modify: `apps/api-server/tests/scene.service.test.ts`
- Modify: `packages/api-contracts/tests/contracts.test.ts`

- [ ] 更新并补充表单、契约、服务测试。
- [ ] 运行格式检查、类型检查、单元测试与构建。
