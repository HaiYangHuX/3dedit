# 模型素材库与分片上传实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立平台自有模型/素材库，完成分类检索、收藏、分片直传 MinIO、BullMQ 解析、元数据/缩略图、失败重试和场景引用删除保护。

**Architecture:** API 使用共享 Zod 契约与 Prisma 保存资源和上传会话；源文件通过 MinIO S3 Multipart 预签名 URL 由浏览器直传，完成后写入 `AssetFile` 并投递 `asset-processing`。Worker 校验 SHA-256、解析 GLB/GLTF 元数据、生成确定性缩略图并原子更新资源状态。前端使用独立 Asset Pinia 和上传调度器，模型库页面与编辑器资源面板复用同一数据层。

**Tech Stack:** Vue 3、Pinia、Element Plus、NestJS/Fastify、Prisma/PostgreSQL、MinIO 8、BullMQ 5、Node Crypto、Three.js r183、Vitest、Playwright。

## Global Constraints

- Three.js 继续精确锁定 `0.183.0`，不得为 Loader 改变版本。
- 支持 GLB、GLTF、FBX、OBJ、STL、USDZ；图片、HDR、视频、贴图、图标按素材类型管理。
- 大文件使用至少 5 MiB 的 S3 Multipart，浏览器不得把完整文件提交给 API。
- 创建上传时必须提交文件大小和 SHA-256；Worker 从 MinIO 重新计算并校验。
- MinIO Key 使用 `assets/{assetId}/source|derived|thumbnail/`。
- 删除前必须检查当前场景和发布引用；被引用资源返回 409。
- 重新上传只有解析成功后才能替换当前源文件，不保留可见历史版本。
- 不实现账号、权限、资产历史版本和浏览器模型减面。
- 核心上传状态、校验、解析和资源所有权必须添加中文注释。

---

### Task 1: 扩展资源数据模型与共享契约

**Files:**
- Modify: `apps/api-server/prisma/schema.prisma`
- Create: `apps/api-server/prisma/migrations/0002_asset_library/migration.sql`
- Create: `packages/api-contracts/src/asset.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Modify: `packages/api-contracts/tests/contracts.test.ts`

**Interfaces:**
- Produces: `Asset` 分类/标签/收藏/失败字段、`UploadSession`；资源查询、更新、上传创建/完成/取消契约。

- [ ] **Step 1: 写资源契约失败测试**

```ts
expect(createUploadInputSchema.parse({ fileName: 'pump.glb', size: 6_000_000, sha256 })).toMatchObject({ format: 'glb' });
expect(() => createUploadInputSchema.parse({ fileName: 'pump.exe', size: 1, sha256 })).toThrow();
expect(completeUploadInputSchema.parse({ parts: [{ partNumber: 1, etag: 'abc' }] })).toBeDefined();
```

- [ ] **Step 2: 运行测试确认缺少契约**

Run: `pnpm --filter @digital-twin/api-contracts test`
Expected: FAIL。

- [ ] **Step 3: 实现模型、素材、状态和上传契约**

格式白名单为 `glb|gltf|fbx|obj|stl|usdz|hdr|png|jpg|jpeg|webp|svg|mp4|webm`；SHA-256 必须为 64 位十六进制；partNumber 必须唯一递增。响应包含 `status=uploading|queued|processing|ready|failed`、metadata、thumbnail URL、文件大小和引用数。

- [ ] **Step 4: 创建数据库迁移**

新增 `category`、`tags text[]`、`favorite`、`error`、`retryCount`、`activeFileId`，创建 `UploadSession` 保存 MinIO uploadId、objectKey、partSize、partCount、校验和、过期时间和状态。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/api-server exec prisma validate && pnpm --filter @digital-twin/api-contracts test && pnpm typecheck`

```bash
git add packages/api-contracts apps/api-server/prisma pnpm-lock.yaml
git commit -m "💥 feat(资源协议): 扩展模型库与上传会话模型"
```

---

### Task 2: 实现资源目录 API 与引用删除保护

**Files:**
- Create: `apps/api-server/src/assets/asset.service.ts`
- Create: `apps/api-server/src/assets/asset.controller.ts`
- Create: `apps/api-server/src/assets/asset.module.ts`
- Modify: `apps/api-server/src/app.module.ts`
- Create: `apps/api-server/tests/asset.service.test.ts`

**Interfaces:**
- Produces: `GET /api/assets`、`GET/PATCH/DELETE /api/assets/:id`、`POST /api/assets/:id/retry`、预签名下载/预览 URL。

- [ ] **Step 1: 写列表过滤、收藏和删除保护失败测试**

测试分页、keyword/kind/category/status/favorite 过滤；资源出现在任一 SceneDocument `assetReferences` 或 Publication 时删除返回 `ASSET_IN_USE` 409。

- [ ] **Step 2: 运行测试确认 AssetService 不存在**

Run: `pnpm --filter @digital-twin/api-server test -- asset.service.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现目录服务和控制器**

列表使用 Prisma 分页并返回 total；详情包含全部文件；更新只允许 name/category/tags/favorite。删除在 Serializable 事务中重新扫描引用，成功后删除数据库记录并在事务提交后移除 MinIO 前缀对象。

- [ ] **Step 4: 实现失败任务重试**

仅 `failed` 可重试；状态原子改为 `queued`、retryCount 加一并投递同一当前源文件。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/api-server test && pnpm --filter @digital-twin/api-server typecheck`

```bash
git add apps/api-server
git commit -m "💥 feat(模型库): 实现资源检索收藏与删除保护"
```

---

### Task 3: 实现 MinIO Multipart 直传和 BullMQ 投递

**Files:**
- Extend: `apps/api-server/src/infrastructure/minio.service.ts`
- Create: `apps/api-server/src/infrastructure/queue.service.ts`
- Modify: `apps/api-server/src/infrastructure/infrastructure.module.ts`
- Create: `apps/api-server/src/uploads/upload.service.ts`
- Create: `apps/api-server/src/uploads/upload.controller.ts`
- Create: `apps/api-server/src/uploads/upload.module.ts`
- Modify: `apps/api-server/src/app.module.ts`
- Create: `apps/api-server/tests/upload.service.test.ts`

**Interfaces:**
- Produces: `POST /api/uploads`、`POST /api/uploads/:id/complete`、`DELETE /api/uploads/:id`。
- Produces: BullMQ `analyze-asset` job `{ assetId, fileId, objectKey, expectedSha256 }`。

- [ ] **Step 1: 写 part 数量、对象 Key 和完成投递失败测试**

断言 13 MiB 文件以 5 MiB partSize 生成 3 个预签名 URL，Key 为 `assets/{assetId}/source/{safeName}`；完成时排序 ETag、写 AssetFile、更新 queued 并在事务后投递一次任务。

- [ ] **Step 2: 实现 MinIO multipart 封装**

使用 `initiateNewMultipartUpload`、带 `partNumber/uploadId` 的 `presignedUrl`、`completeMultipartUpload` 和 `abortMultipartUpload`；调用方不接触 MinIO 内部方法。

- [ ] **Step 3: 实现上传服务与过期保护**

上传会话默认 24 小时；完成前校验 part 集合、状态和过期时间；API 请求幂等，重复 complete 返回已排队资源而不重复投递。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter @digital-twin/api-server test && pnpm --filter @digital-twin/api-server build`

```bash
git add apps/api-server pnpm-lock.yaml
git commit -m "💥 feat(分片上传): 接入MinIO直传与资源任务队列"
```

---

### Task 4: Worker 校验源文件并解析模型元数据

**Files:**
- Create: `apps/asset-worker/src/jobs/analyzeAsset.ts`
- Create: `apps/asset-worker/src/parsers/glb.ts`
- Create: `apps/asset-worker/src/parsers/gltf.ts`
- Create: `apps/asset-worker/src/thumbnail/createAssetThumbnail.ts`
- Modify: `apps/asset-worker/src/main.ts`
- Modify: `apps/asset-worker/package.json`
- Create: `apps/asset-worker/tests/glb.test.ts`
- Create: `apps/asset-worker/tests/analyzeAsset.test.ts`

**Interfaces:**
- Consumes: `analyze-asset` job。
- Produces: SHA-256、格式、包围盒、顶点/面数、材质/贴图/动画/相机、Draco/Meshopt/KTX2 标识和 SVG/PNG 缩略图。

- [ ] **Step 1: 写最小 GLB fixture 解析失败测试**

构造合法 GLB header、JSON chunk 和 BIN chunk，断言 mesh/material/animation/camera 数量与 accessor 顶点数；错误 magic/version/length 必须失败。

- [ ] **Step 2: 实现流式哈希与 GLB/GLTF 解析**

MinIO 流同时计算 hash 和受上限保护的解析缓冲；GLB 只读取 JSON chunk 即可统计，未知扩展记录但不导致任务失败。FBX/OBJ/STL/USDZ 首期记录文件级元数据和格式，后续 Loader 阶段补充几何细节。

- [ ] **Step 3: 实现确定性缩略图和原子状态更新**

解析成功写 derived metadata 和 thumbnail 文件后，单事务将 activeFileId 指向新文件并设置 ready；任何失败写 status=failed/error，不替换已有 ready 文件。

- [ ] **Step 4: 接入 Worker 分发和优雅退出**

`main.ts` 支持 `foundation-ping` 与 `analyze-asset`；每个任务使用独立 Prisma/MinIO 操作范围，进程关闭等待当前解析完成。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/asset-worker test && pnpm --filter @digital-twin/asset-worker typecheck && pnpm --filter @digital-twin/asset-worker build`

```bash
git add apps/asset-worker pnpm-lock.yaml
git commit -m "💥 feat(资源解析): 校验源文件并提取模型元数据"
```

---

### Task 5: 前端上传调度器、Asset Store 与模型库页面

**Files:**
- Create: `apps/editor-web/src/api/assets.ts`
- Create: `apps/editor-web/src/uploads/hashFile.ts`
- Create: `apps/editor-web/src/uploads/multipartUpload.ts`
- Create: `apps/editor-web/src/stores/asset.ts`
- Modify: `apps/editor-web/src/views/AssetsView.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Create: `apps/editor-web/tests/multipartUpload.test.ts`
- Create: `apps/editor-web/tests/assetStore.test.ts`
- Create: `apps/editor-web/tests/AssetsView.test.ts`

**Interfaces:**
- Produces: 文件 hash、3 路并发 part 上传、进度/取消/重试、资源筛选收藏删除 UI。

- [ ] **Step 1: 写切片、并发、进度与取消失败测试**

使用 13 MiB Blob 和预签名 URL，断言切为 3 part、ETag 去引号、总体进度单调、AbortSignal 中止全部 fetch。

- [ ] **Step 2: 实现上传调度器与 Store**

Store 保存 JSON 状态和进度，不保存 File 到持久 Pinia；同名任务以本地 taskId 区分，完成后轮询 queued/processing 直到 ready/failed。

- [ ] **Step 3: 实现模型库页面**

页面包含格式拖放区、搜索、类型/分类/状态过滤、卡片/表格切换、缩略图、大小、统计、收藏、编辑、下载、重试、删除保护提示和上传任务抽屉。

- [ ] **Step 4: 编辑器资源面板复用模型列表**

模型资源卡支持双击和拖放数据 `application/x-digital-twin-asset`，场景节点添加在完整编辑阶段接入命令系统。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/editor-web test && pnpm --filter @digital-twin/editor-web typecheck && pnpm --filter @digital-twin/editor-web build`

```bash
git add apps/editor-web
git commit -m "🌷 UI(模型库): 完成资源管理与分片上传界面"
```

---

### Task 6: 真实 MinIO、Worker 与浏览器闭环验收

**Files:**
- Create: `tests/e2e/asset-upload.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`

- [ ] **Step 1: 写上传闭环失败测试**

浏览器上传最小 GLB，等待进度完成和 Worker 状态 ready，断言缩略图、顶点/面统计和详情；创建引用该资源的场景后删除返回保护冲突，清理场景后成功删除。

- [ ] **Step 2: 配置 integration WebServer**

`E2E_DATABASE=true` 时同时启动 API、asset-worker、editor-web；测试使用独立 MinIO/PostgreSQL/Redis 端口并在结束时清理对象和数据库。

- [ ] **Step 3: 执行真实闭环和全仓验证**

```bash
set -a && source .env && set +a
docker compose up -d
pnpm --filter @digital-twin/api-server exec prisma migrate deploy
E2E_DATABASE=true pnpm test:e2e -- asset-upload.spec.ts
pnpm verify
git diff --check
```

- [ ] **Step 4: 提交验收**

```bash
git add tests/e2e playwright.config.ts README.md
git commit -m "✅ tests(模型库): 验证分片上传解析与删除保护"
```

## Completion Gate

1. 模型与素材支持分类、标签、搜索、分页、收藏、详情和下载。
2. 支持约定格式的 MinIO Multipart 直传、进度、取消与失败重试。
3. Worker 重新校验 SHA-256 并解析 GLB/GLTF 元数据，状态可恢复。
4. 缩略图和派生文件位于约定 Key，数据库只存元数据和 Key。
5. 资源被当前场景或发布引用时不能删除。
6. 前端模型库、编辑器资源面板和上传任务使用同一 Asset Store。
7. 单元、类型、构建、WebGL 和真实上传闭环测试全部通过。
