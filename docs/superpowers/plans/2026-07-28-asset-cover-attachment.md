# Asset Cover Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将模型封面保存为模型自身的 `AssetFile(role='cover')`，上传封面时不再创建独立图片资源。

**Architecture:** 扩展现有 multipart 上传协议，使用 `purpose: 'source' | 'cover'` 区分源文件和封面。封面上传必须绑定已有 `assetId`，完成后直接写入附件并返回 `ready`，不触发模型解析；资源 DTO 优先读取自身封面附件，同时保留历史 `coverAssetId` 回退。

**Tech Stack:** TypeScript, Vue 3, Pinia, NestJS, Prisma, Zod, Vitest, MinIO multipart upload

## Global Constraints

- 新封面不得创建独立 `Asset`，不得改变模型源文件、格式、状态或解析队列。
- 封面仅允许 PNG、JPG、JPEG、WebP，且必须绑定已有资源 `assetId`。
- 保留历史 `coverAssetId` 的读取兼容，新附件封面优先。
- 新建模型加封面时只新增一个模型资源。
- 未经用户明确要求不执行 Git commit 或 push。

---

### Task 1: 上传协议与数据库会话用途

**Files:**
- Modify: `packages/api-contracts/src/asset.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Test: `packages/api-contracts/tests/contracts.test.ts`
- Modify: `apps/api-server/prisma/schema.prisma`
- Create: `apps/api-server/prisma/migrations/0009_asset_cover_upload_purpose/migration.sql`
- Create: `apps/api-server/prisma/migrations/0010_active_asset_cover_file/migration.sql`

**Interfaces:**
- Produces: `UploadPurpose = 'source' | 'cover'`、`CreateUploadInput.purpose`、`UploadCompletion` 的 `queued | ready` 判别联合。
- Produces: `UploadSession.purpose String @default("source")`、`Asset.activeCoverFileId` 当前封面指针。

- [ ] **Step 1: 写失败契约测试**

覆盖三条行为：`purpose='cover'` 缺少 `assetId` 时失败；封面扩展名不是图片时失败；合法封面输入被归一化并保留 `purpose='cover'`。同时验证完成回执接受 `{ status: 'ready', assetId, fileId }` 且无需 `jobId`。

- [ ] **Step 2: 运行契约测试并确认按预期失败**

Run: `pnpm --filter @digital-twin/api-contracts test -- --run tests/contracts.test.ts`

Expected: FAIL，原因是 `purpose` 尚未校验且 `ready` 回执尚不受支持。

- [ ] **Step 3: 实现最小协议与迁移**

在上传输入基础 schema 增加：

```ts
purpose: z.enum(['source', 'cover']).optional().default('source'),
```

在 transform 中根据 `purpose` 校验：

```ts
if (input.purpose === 'cover' && !input.assetId) {
  context.addIssue({ code: 'custom', message: '封面上传必须绑定资源编号' });
  return z.NEVER;
}
if (input.purpose === 'cover' && !imageFormats.has(parsedFormat.data)) {
  context.addIssue({ code: 'custom', message: '封面仅支持图片格式' });
  return z.NEVER;
}
```

将 `uploadCompletionSchema` 改为 `queued` 和 `ready` 的判别联合；`queued` 保留必填 `jobId`，`ready` 不含 `jobId`。Prisma 会话增加 `purpose`，迁移 SQL：

```sql
ALTER TABLE "UploadSession"
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'source';
```

- [ ] **Step 4: 运行契约测试与类型检查**

Run: `pnpm --filter @digital-twin/api-contracts test -- --run tests/contracts.test.ts`

Expected: PASS。

---

### Task 2: 后端封面上传会话与完成逻辑

**Files:**
- Modify: `apps/api-server/src/uploads/upload.service.ts`
- Test: `apps/api-server/tests/upload.service.test.ts`

**Interfaces:**
- Consumes: `CreateUploadInput.purpose`、`UploadSessionRow.purpose`、`UploadCompletion` 判别联合。
- Produces: cover 对象键 `assets/<assetId>/cover/<filename>`；完成回执 `{ status: 'ready', assetId, fileId }`。

- [ ] **Step 1: 写封面创建会话失败测试**

测试 `service.create()` 使用已有模型且 `purpose='cover'` 时：不调用 `asset.create`/`asset.update`，上传对象键进入 `cover` 目录，会话保存 `purpose='cover'`。

- [ ] **Step 2: 运行单测并确认失败**

Run: `pnpm --filter @digital-twin/api-server test -- --run tests/upload.service.test.ts`

Expected: FAIL，现有实现仍使用 `source` 目录并把模型状态改为 `uploading`。

- [ ] **Step 3: 实现封面会话创建分支**

使用 `const isCover = input.purpose === 'cover'`。封面必须查到现有 `Asset`，对象键目录使用 `cover`，会话写入 `purpose`；仅 `source` 替换上传修改模型状态，封面不写元数据快照到模型。

- [ ] **Step 4: 写封面完成失败测试**

测试完成 `purpose='cover'` 会话时：创建新 `AssetFile(role='cover')`；更新 `activeCoverFileId`；保留旧文件记录；清空 `coverAssetId`；不创建 `ProcessingJob`、不调用队列、不修改资源状态；返回 `ready`。重复完成同一会话时应直接恢复同一 `ready` 回执，后续更换封面也不破坏旧回执。

- [ ] **Step 5: 运行单测并确认失败**

Run: `pnpm --filter @digital-twin/api-server test -- --run tests/upload.service.test.ts`

Expected: FAIL，现有完成流程固定创建 `source` 文件和解析任务。

- [ ] **Step 6: 实现封面完成和恢复分支**

在 multipart 完成后按 `session.purpose` 分流。封面分支事务内创建新封面、更新 `activeCoverFileId`、清空 `coverAssetId` 并完成会话；历史文件随资源保留。`resumeCompleted()` 对 cover 只查询该会话的文件并返回 `ready`，不查任务、不重新入队。

- [ ] **Step 7: 运行后端上传单测**

Run: `pnpm --filter @digital-twin/api-server test -- --run tests/upload.service.test.ts`

Expected: PASS，包括普通源文件上传与替换回归测试。

- [ ] **Step 8: 增加完成恢复与取消竞态保护**

完成 MinIO 后先将会话从 `completing` 更新为 `uploaded`，数据库附件事务内原子抢占 `uploaded -> finalizing` 后收尾。重试 `uploaded` 会话时跳过 MinIO，并发输家恢复已完成回执；`completing` 使用 `updatedAt` 租约和 fencing token，超时时根据 MinIO 对象状态恢复，complete 异常也先检查对象是否实际完成。取消只允许将 `uploading` 改为 `cancelling`；`cancelling` 复用租约与 token，超时可重试，`NoSuchUpload` 按成功处理，明确 abort 失败恢复为 `uploading`。封面对象键使用 UUID 前缀，避免固定时钟或同毫秒并发时碰撞；预签名失败删除不可见会话。

---

### Task 3: 模型 DTO 使用自身封面附件

**Files:**
- Modify: `apps/api-server/src/assets/asset.service.ts`
- Test: `apps/api-server/tests/asset.service.test.ts`

**Interfaces:**
- Consumes: `AssetFile.role='cover'`。
- Produces: `Asset.coverUrl` 优先使用 `activeCoverFile`，再按附件、历史关联和缩略图回退。

- [ ] **Step 1: 写失败映射测试**

构造同时具有自身 `cover`、历史 `coverAsset` 和自动 `thumbnail` 的模型，断言 `coverUrl` 对自身 cover 的 object key 调用 `presignGet`；再验证没有自身 cover 时仍回退历史关联和缩略图。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @digital-twin/api-server test -- --run tests/asset.service.test.ts`

Expected: FAIL，现有映射未读取 `role='cover'`。

- [ ] **Step 3: 实现最小读取优先级**

封面候选顺序为：

```ts
activeCoverFile ?? ownCover ?? legacyCoverActiveFile ?? legacyCoverSource ?? legacyCoverThumbnail
```

若全部为空，继续回退模型 `thumbnailUrl`。

- [ ] **Step 4: 运行 AssetService 测试**

Run: `pnpm --filter @digital-twin/api-server test -- --run tests/asset.service.test.ts`

Expected: PASS。

---

### Task 4: 前端上传状态与表单顺序

**Files:**
- Modify: `apps/editor-web/src/stores/asset.ts`
- Test: `apps/editor-web/tests/assetStore.test.ts`
- Modify: `apps/editor-web/src/components/AssetFormDialog.vue`
- Test: `apps/editor-web/tests/AssetFormDialog.test.ts`

**Interfaces:**
- Consumes: `UploadFileOptions.purpose`、`UploadCompletion.status`。
- Produces: 编辑封面调用 `uploadFile(file, { purpose: 'cover', assetId })`；新建时先得到源模型 ID 再上传封面。

- [ ] **Step 1: 写 store 失败测试**

模拟 cover 完成回执为 `ready`，断言 create 请求携带 `purpose='cover'`，完成后只调用一次 `assetApi.get(assetId)` 刷新详情，不进入 `pollUntilSettled` 循环，并把原模型列表项替换为带新 `coverUrl` 的 DTO。

- [ ] **Step 2: 运行 store 测试并确认失败**

Run: `pnpm --filter @digital-twin/editor-web test -- --run tests/assetStore.test.ts`

Expected: FAIL，现有 action 未发送 purpose 且固定轮询。

- [ ] **Step 3: 实现 store 分支**

给 `UploadFileOptions` 增加 `purpose?: 'source' | 'cover'`，创建会话时透传。完成后若回执为 `ready`，直接 `assetApi.get(session.assetId)`；否则保持现有解析轮询。

- [ ] **Step 4: 写表单失败测试**

编辑场景：模拟选择封面后保存，断言只上传一次，options 含当前 `asset.id` 和 `purpose='cover'`，并且元数据更新仍作用于原模型。新建场景：断言第一轮上传源文件，第二轮封面上传使用第一轮任务返回的 `assetId`，两次调用都不创建第二个资源语义。

- [ ] **Step 5: 运行表单测试并确认失败**

Run: `pnpm --filter @digital-twin/editor-web test -- --run tests/AssetFormDialog.test.ts`

Expected: FAIL，现有表单先把封面作为普通资源上传。

- [ ] **Step 6: 调整表单提交顺序**

编辑时先保存元数据或替换源文件，再以当前模型 ID 上传封面；新建时先上传源文件，读取 `task.assetId`，再上传封面。封面 options 固定为：

```ts
{ purpose: 'cover', assetId }
```

移除 `metadataInput(coverAssetId)` 和封面独立资源名称/分类。

- [ ] **Step 7: 运行前端相关测试**

Run: `pnpm --filter @digital-twin/editor-web test -- --run tests/assetStore.test.ts tests/AssetFormDialog.test.ts`

Expected: PASS。

- [ ] **Step 8: 保留新建资源 ID 供封面重试**

源文件首次上传成功后，在对话框关闭或重置前保留返回的 `assetId`、源文件引用和元数据快照。如果随后封面上传失败，内容未变化时直接使用该 ID 重试封面；更换源文件时替换同一资源，只改元数据时先更新同一资源。

- [ ] **Step 9: 保留服务端取消重试入口**

浏览器 abort 后请求服务端取消；只有远端取消成功才标记任务 `cancelled`。远端失败时恢复 `uploading` 并显示错误，控制器生命周期结束后再次点击取消会直接重试取消 API。

---

### Task 5: 全量验证

**Files:**
- Verify only; no additional production edits unless a failing regression identifies an in-scope defect.

- [ ] **Step 1: 生成 Prisma Client 并运行类型检查**

Run: `pnpm --filter @digital-twin/api-server exec prisma generate`

Run: `pnpm typecheck`

Expected: PASS。

- [ ] **Step 2: 运行相关工作区测试**

Run: `pnpm --filter @digital-twin/api-contracts test -- --run`

Run: `pnpm --filter @digital-twin/api-server test -- --run`

Run: `pnpm --filter @digital-twin/editor-web test -- --run`

Expected: PASS。

- [ ] **Step 3: 运行构建**

Run: `pnpm build`

Expected: PASS。

- [ ] **Step 4: 检查最终差异**

Run: `git diff --check`

Run: `git status --short`

Expected: 无空白错误；仅包含本修复的协议、迁移、后端、前端、测试和设计/计划文件。
