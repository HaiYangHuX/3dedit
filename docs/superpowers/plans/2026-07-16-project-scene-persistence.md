# 项目与场景持久化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成无需登录的项目与多场景 CRUD、复制排序、并发安全保存，以及编辑器从真实 API 加载和保存场景的完整纵向链路。

**Architecture:** 共享包以 Zod 定义请求和响应契约；NestJS 模块化单体通过 ProjectService 与 SceneService 操作 Prisma。场景保存使用 `revision` 条件更新防止并发覆盖，并由服务端重算资源引用和 SHA-256。Vue 端通过统一 API Client 与 Pinia 管理可序列化文档、加载状态和保存状态，Three.js 对象仍由引擎独立持有。

**Tech Stack:** Vue 3.5、Pinia 4、Element Plus 2.14、Zod 4、NestJS 11、Fastify 5、Prisma 6、PostgreSQL 17、Vitest、Playwright。

## Global Constraints

- 只修改 `数字孪生场景平台`，不得修改旧 React 与 Koa 项目。
- 不实现登录、账号、权限、多租户和业务历史版本。
- 场景协议保存前后端都必须执行 Zod 校验。
- 保存请求必须携带 `baseRevision`；不一致返回 HTTP 409。
- 服务端必须重算 `assetReferences` 和内容哈希，不能信任前端资源清单。
- 一个项目始终至少保留一个场景；删除最后一个场景返回 HTTP 409。
- Pinia 只保存 JSON 文档和 UI 状态，不保存 Three.js 对象。
- 新增导出 API、并发约束和非直观状态转换必须添加有效中文注释。

---

### Task 1: 扩展共享项目与场景 API 契约

**Files:**
- Modify: `packages/api-contracts/package.json`
- Create: `packages/api-contracts/src/project.ts`
- Create: `packages/api-contracts/src/scene.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Create: `packages/api-contracts/tests/contracts.test.ts`

**Interfaces:**
- Consumes: `sceneDocumentSchema` 与 `SceneDocument`。
- Produces: `createProjectInputSchema`、`updateProjectInputSchema`、`createSceneInputSchema`、`updateSceneInputSchema`、`saveSceneInputSchema` 及对应 TypeScript 类型。

- [ ] **Step 1: 写项目和场景契约失败测试**

```ts
expect(() => createProjectInputSchema.parse({ name: '  ' })).toThrow();
expect(() => saveSceneInputSchema.parse({ baseRevision: -1, document })).toThrow();
expect(saveSceneInputSchema.parse({ baseRevision: 0, document })).toBeDefined();
```

- [ ] **Step 2: 运行测试确认契约尚未导出**

Run: `pnpm --filter @digital-twin/api-contracts test`
Expected: FAIL，缺少契约文件或导出。

- [ ] **Step 3: 实现 Zod 输入输出契约**

`createProjectInputSchema` 将项目名 trim 后限制为 1..80 字符，描述限制为 0..500 字符；更新契约至少包含一个字段。场景名限制为 1..80 字符；排序请求为不重复的场景 ID 数组。保存契约必须组合真实 `sceneDocumentSchema`：

```ts
export const saveSceneInputSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  document: sceneDocumentSchema,
});
export type SaveSceneInput = z.infer<typeof saveSceneInputSchema>;
```

响应契约包含 ISO 时间、项目场景数、场景 `revision`、完整 `document` 和 `contentHash`。

- [ ] **Step 4: 运行契约测试和类型检查**

Run: `pnpm --filter @digital-twin/api-contracts test && pnpm --filter @digital-twin/api-contracts typecheck`
Expected: 契约测试全部 PASS。

- [ ] **Step 5: 提交共享契约**

```bash
git add packages/api-contracts pnpm-lock.yaml
git commit -m "💥 feat(API契约): 定义项目与场景请求响应"
```

---

### Task 2: 建立 NestJS Zod 边界与项目 CRUD

**Files:**
- Modify: `apps/api-server/package.json`
- Create: `apps/api-server/src/common/zod-validation.pipe.ts`
- Create: `apps/api-server/src/projects/project.service.ts`
- Create: `apps/api-server/src/projects/project.controller.ts`
- Create: `apps/api-server/src/projects/project.module.ts`
- Modify: `apps/api-server/src/app.module.ts`
- Modify: `apps/api-server/src/main.ts`
- Create: `apps/api-server/tests/project.service.test.ts`

**Interfaces:**
- Consumes: Prisma `Project`/`Scene`、`createDefaultSceneDocument()` 和项目输入契约。
- Produces: `GET/POST /api/projects`、`GET/PATCH/DELETE /api/projects/:id`、`POST /api/projects/:id/copy`。

- [ ] **Step 1: 写创建项目与默认场景失败测试**

测试注入内存 Prisma 替身，固定 `randomUUID` 生成结果，断言一次事务内创建项目和名为“场景一”的默认场景，默认文档的 `projectId`、`id` 与数据库 ID 一致。

- [ ] **Step 2: 运行测试确认 ProjectService 不存在**

Run: `pnpm --filter @digital-twin/api-server test -- project.service.test.ts`
Expected: FAIL，无法导入 `ProjectService`。

- [ ] **Step 3: 实现 ZodValidationPipe**

```ts
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '请求参数校验失败',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
```

- [ ] **Step 4: 实现 ProjectService**

项目列表支持 `keyword` 模糊搜索并按 `updatedAt desc` 排序。创建项目由服务端生成项目/场景 ID，在同一事务写入默认场景。复制项目复制当前所有场景但生成新 ID、重置 `revision=0` 并修正文档的项目/场景 ID。不存在返回 `NotFoundException`。

- [ ] **Step 5: 实现 Controller、Module 和 CORS**

Controller 对 body/query 使用契约 pipe；`main.ts` 调用 `app.enableCors({ origin: true })`，安装与 Fastify 5 匹配的 `@fastify/cors`。所有路由位于已有全局 `/api` 前缀下。

- [ ] **Step 6: 运行项目服务测试、类型和构建**

Run: `pnpm --filter @digital-twin/api-server test && pnpm --filter @digital-twin/api-server typecheck && pnpm --filter @digital-twin/api-server build`
Expected: 项目测试 PASS，类型与构建无错误。

- [ ] **Step 7: 提交项目 CRUD**

```bash
git add apps/api-server pnpm-lock.yaml
git commit -m "💥 feat(项目): 实现项目管理与默认场景事务"
```

---

### Task 3: 实现场景 CRUD、排序与并发保存

**Files:**
- Create: `apps/api-server/src/scenes/scene-document.ts`
- Create: `apps/api-server/src/scenes/scene.service.ts`
- Create: `apps/api-server/src/scenes/scene.controller.ts`
- Create: `apps/api-server/src/scenes/scene.module.ts`
- Modify: `apps/api-server/src/app.module.ts`
- Create: `apps/api-server/tests/scene-document.test.ts`
- Create: `apps/api-server/tests/scene.service.test.ts`

**Interfaces:**
- Produces: `GET /api/scenes/:id`、`POST /api/projects/:projectId/scenes`、`PATCH/DELETE /api/scenes/:id`、`POST /api/scenes/:id/copy`、`PUT /api/projects/:projectId/scenes/order`、`PUT /api/scenes/:id/document`。
- Produces: `normalizeSceneDocument(document, identity, revision)` 与 `hashSceneDocument(document)`。

- [ ] **Step 1: 写文档归一化失败测试**

构造包含重复/伪造 `assetReferences` 的文档，断言归一化结果只从 model 组件和 `environmentAssetId` 生成去重且排序稳定的引用；相同语义但对象键顺序不同的文档哈希必须相同。

- [ ] **Step 2: 运行测试确认工具不存在**

Run: `pnpm --filter @digital-twin/api-server test -- scene-document.test.ts`
Expected: FAIL，缺少文档归一化函数。

- [ ] **Step 3: 实现服务端文档归一化和稳定哈希**

递归排序 JSON 对象键后计算 SHA-256。服务端覆盖 `id`、`projectId`、`revision`、`name` 与 `assetReferences`；引用按 `assetId` 排序，`nodeIds` 去重并排序。

- [ ] **Step 4: 写并发保存和最后场景保护失败测试**

```ts
expect(prisma.scene.updateMany).toHaveBeenCalledWith(
  expect.objectContaining({ where: { id: sceneId, revision: 3 } }),
);
await expect(service.save(sceneId, staleInput)).rejects.toBeInstanceOf(ConflictException);
await expect(service.remove(lastSceneId)).rejects.toBeInstanceOf(ConflictException);
```

- [ ] **Step 5: 实现 SceneService 与 Controller**

保存使用 `updateMany({ where: { id, revision: baseRevision } })` 原子条件更新；`count=0` 时查询区分 404 与 409。创建、复制、排序均在事务中执行。删除前统计同项目场景数并拒绝最后一个场景。

- [ ] **Step 6: 运行场景测试与全 API 验证**

Run: `pnpm --filter @digital-twin/api-server test && pnpm --filter @digital-twin/api-server typecheck && pnpm --filter @digital-twin/api-server build`
Expected: 文档、并发、保护测试全部 PASS。

- [ ] **Step 7: 提交场景持久化**

```bash
git add apps/api-server
git commit -m "💥 feat(场景): 实现多场景管理与并发安全保存"
```

---

### Task 4: 接入前端 API Client 与项目 Pinia

**Files:**
- Modify: `apps/editor-web/package.json`
- Create: `apps/editor-web/src/api/client.ts`
- Create: `apps/editor-web/src/api/projects.ts`
- Create: `apps/editor-web/src/stores/project.ts`
- Create: `apps/editor-web/tests/projectStore.test.ts`

**Interfaces:**
- Consumes: 项目与场景共享契约。
- Produces: `apiRequest<T>()`、`projectApi` 与 `useProjectStore()`。

- [ ] **Step 1: 写 API 错误与项目 Store 失败测试**

Mock `fetch`，断言非 2xx 转换为含 `status`、`code`、`message` 的 `ApiError`；项目 Store 能加载、创建、复制、删除项目并保持 loading/error 状态对称。

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `pnpm --filter @digital-twin/editor-web test -- projectStore.test.ts`
Expected: FAIL，缺少 API Client 或 Store。

- [ ] **Step 3: 实现统一 API Client**

默认 base URL 为 `VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api'`；JSON 请求统一设置 header，204 返回 `undefined`，网络错误与 HTTP 错误保留可展示中文信息。

- [ ] **Step 4: 实现 projectApi 与 Project Store**

Store 仅保存响应 DTO、搜索词、loading 和 error；每个异步动作使用 `try/finally` 恢复 loading，删除当前项目时清空选择。

- [ ] **Step 5: 运行前端单测、类型与构建**

Run: `pnpm --filter @digital-twin/editor-web test && pnpm --filter @digital-twin/editor-web typecheck && pnpm --filter @digital-twin/editor-web build`
Expected: Store 测试 PASS。

- [ ] **Step 6: 提交前端数据层**

```bash
git add apps/editor-web pnpm-lock.yaml
git commit -m "💥 feat(前端数据): 接入项目场景API与状态管理"
```

---

### Task 5: 完成项目管理与场景列表页面

**Files:**
- Modify: `apps/editor-web/src/views/ProjectsView.vue`
- Create: `apps/editor-web/src/views/ProjectDetailView.vue`
- Modify: `apps/editor-web/src/router.ts`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Create: `apps/editor-web/tests/ProjectsView.test.ts`
- Create: `apps/editor-web/tests/ProjectDetailView.test.ts`

**Interfaces:**
- Produces: `/projects` 项目搜索/创建/复制/删除；`/projects/:projectId` 场景创建/复制/删除/进入编辑器。

- [ ] **Step 1: 写项目页面交互失败测试**

挂载页面并注入测试 Pinia，断言加载真实项目卡片、创建对话框校验空名称、复制和删除按钮调用对应 Store action。

- [ ] **Step 2: 运行测试确认占位页面失败**

Run: `pnpm --filter @digital-twin/editor-web test -- ProjectsView.test.ts ProjectDetailView.test.ts`
Expected: FAIL，占位页没有业务交互。

- [ ] **Step 3: 实现 ProjectsView**

使用 Element Plus 表单、对话框、确认框、空状态与骨架屏。搜索采用 300ms 防抖；项目卡显示场景数、更新时间、描述和进入按钮。

- [ ] **Step 4: 实现 ProjectDetailView**

展示项目说明与场景卡片，支持新建、复制、删除和进入 `/editor/:projectId/:sceneId`；最后场景删除冲突展示 API 中文错误，不在前端伪造成功状态。

- [ ] **Step 5: 运行页面测试、类型、Lint 和构建**

Run: `pnpm --filter @digital-twin/editor-web test && pnpm --filter @digital-twin/editor-web typecheck && pnpm lint && pnpm --filter @digital-twin/editor-web build`
Expected: 页面测试全部 PASS。

- [ ] **Step 6: 提交项目页面**

```bash
git add apps/editor-web
git commit -m "🌷 UI(项目): 完成项目与多场景管理页面"
```

---

### Task 6: 编辑器加载与显式手动保存

**Files:**
- Modify: `apps/editor-web/src/stores/document.ts`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Create: `apps/editor-web/tests/documentStore.test.ts`
- Modify: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- Consumes: `projectApi.getScene()`、`projectApi.saveScene()`。
- Produces: `loadScene(sceneId)`、`markDirty()`、`save()`、`dispose()` 以及 `saveState`。

- [ ] **Step 1: 写场景加载、保存和 409 冲突失败测试**

使用 fake timers 和 mock API，断言加载替换文档；`markDirty` 后不会发起保存，只有显式调用 `save()` 才提交；成功时使用服务端新 revision 并变为 saved；409 时保留本地文档并变为 conflict。

- [ ] **Step 2: 运行测试确认现有 Store 不支持持久化**

Run: `pnpm --filter @digital-twin/editor-web test -- documentStore.test.ts`
Expected: FAIL，缺少持久化动作。

- [ ] **Step 3: 实现 Document Store 状态机**

状态仅允许 `idle/loading/saved/dirty/saving/conflict/error`。同一时间只执行一个保存；保存期间再次变脏时，当前请求完成后再保存一次。卸载时清除定时器，迟到的加载响应不能覆盖新场景。

- [ ] **Step 4: 接入 EditorWorkspace**

从路由读取项目/场景 ID，进入时加载，离开时使迟到的加载响应失效。工具栏显示真实场景名与保存状态；保存按钮触发 `save()`，冲突状态提供“重新加载”按钮。

- [ ] **Step 5: 运行 Store、工作台测试与构建**

Run: `pnpm --filter @digital-twin/editor-web test && pnpm --filter @digital-twin/editor-web typecheck && pnpm --filter @digital-twin/editor-web build`
Expected: 显式保存和冲突测试 PASS。

- [ ] **Step 6: 提交编辑器持久化**

```bash
git add apps/editor-web
git commit -m "💥 feat(编辑器): 接入场景加载与并发保存状态"
```

---

### Task 7: 真实数据库与浏览器纵向验收

**Files:**
- Create: `tests/e2e/project-scene.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: PostgreSQL、API 3000、editor-web 5173。
- Produces: 项目创建 → 场景创建 → 进入编辑器 → 保存的真实 E2E。

- [ ] **Step 1: 写纵向链路失败测试**

测试生成唯一项目名，通过页面创建项目、进入项目详情、新建场景、进入编辑器，等待 `data-engine-ready=true`，点击保存并看到“已保存”；结束时通过 API 删除测试项目。

- [ ] **Step 2: 运行测试确认链路尚未满足**

Run: `pnpm test:e2e -- project-scene.spec.ts`
Expected: FAIL，API webServer 或页面行为尚未配置完整。

- [ ] **Step 3: 配置 API WebServer 与测试环境**

Playwright 增加 API webServer；纵向测试仅在 `E2E_DATABASE=true` 时运行，普通 `pnpm verify` 保持无 Docker 依赖。README 写明真实集成命令和端口覆盖方式。

- [ ] **Step 4: 启动基础设施、应用迁移并执行真实 E2E**

```bash
cp .env.example .env
docker compose up -d postgres redis minio minio-init
pnpm --filter @digital-twin/api-server exec prisma migrate deploy
E2E_DATABASE=true pnpm test:e2e -- project-scene.spec.ts
```

Expected: 项目与场景纵向测试 PASS，测试数据完成清理。

- [ ] **Step 5: 执行阶段总验证**

```bash
pnpm format
pnpm verify
pnpm --filter @digital-twin/api-server exec prisma migrate status
git diff --check
git status --short
```

Expected: 全仓验证通过，数据库迁移最新，Git 只包含本任务预期文件。

- [ ] **Step 6: 提交纵向验收**

```bash
git add tests/e2e playwright.config.ts README.md
git commit -m "✅ tests(项目场景): 补充持久化纵向浏览器验收"
```

## Completion Gate

1. 无需登录即可创建、搜索、编辑、复制和删除项目。
2. 项目创建时原子生成可用默认场景。
3. 场景支持创建、复制、排序和删除保护。
4. 场景保存前后端 Zod 校验，服务端重算资源引用与稳定哈希。
5. 两个标签页以相同 revision 保存时，后到请求返回 409。
6. 编辑器从 API 加载文档，支持显式手动保存与冲突状态。
7. 单元、类型、构建、Lint、WebGL 冒烟和真实数据库纵向测试全部通过。
