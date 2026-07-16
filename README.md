# 数字孪生场景平台

全新的 Vue 3 + Three.js r183 数字孪生场景编辑与发布平台。本仓库采用 Monorepo，同时包含编辑器、轻量运行时、API、资源 Worker 和共享内核。

> 旧 React 前端与旧 Koa 后端不属于本仓库，本项目的脚本不会修改它们。

## 技术基线

- Node.js 24，pnpm 10.12.1
- Vue 3、TypeScript strict、Pinia、Element Plus
- Three.js `0.183.0`，`@types/three` `0.183.1`
- NestJS 11 + Fastify 5 + Prisma 6
- PostgreSQL 17、Redis 8、MinIO、BullMQ
- Vitest + Playwright

## 仓库结构

```text
apps/
  editor-web/       场景编辑器
  runtime-web/      无 UI 库的发布运行时
  api-server/       NestJS/Fastify API
  asset-worker/     BullMQ 资源处理进程
packages/
  scene-schema/     版本化场景文档协议
  editor-core/      命令、撤销、重做与脏状态
  three-engine/     Three.js 渲染与 GPU 资源生命周期
  api-contracts/    前后端共享 API 契约
```

## 启动

```bash
corepack prepare pnpm@10.12.1 --activate
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @digital-twin/api-server exec prisma migrate deploy
pnpm dev
```

默认端口：编辑器 `5173`、运行时 `5174`、API `3000`、PostgreSQL `5432`、Redis `6379`、MinIO `9000/9001`。当本机端口被占用时，可在 `.env` 中同步调整 `*_PORT`、`DATABASE_URL` 和 `REDIS_URL`。

`pnpm dev` 会同时启动 `asset-worker`。上传流程为浏览器分块计算 SHA-256 → 3 路并发直传 MinIO → API 完成 Multipart → BullMQ Worker 校验并解析 → 原子切换可用源文件。请勿只启动 Web 与 API 而遗漏 Worker。

## 模型与素材库

- 支持 GLB、GLTF、FBX、OBJ、STL、USDZ、HDR、PNG/JPG/WEBP/SVG、MP4/WEBM。
- 文件至少按 5 MiB 分片，API 不接收完整文件字节；MinIO 预签名 PUT 响应通过服务级 CORS 暴露 `ETag`。
- GLB/GLTF 会统计顶点、面、Mesh、材质、贴图、动画、相机、包围盒及 Draco/Meshopt/KTX2 扩展。
- 解析成功前不会替换当前可用源文件；失败任务可重试。
- 被当前场景引用的资源不能删除，接口返回 `ASSET_IN_USE` 409。
- 编辑器左侧模型面板与模型库页面复用同一个 Asset Pinia，并提供平台专用拖放 MIME。

## 验证

```bash
pnpm exec playwright install chromium
pnpm verify
```

`verify` 依次执行格式、Lint、类型检查、单元测试、全量构建和真实浏览器 WebGL 冒烟测试。

### 真实项目与场景纵向验收

该测试会创建临时项目、验证两次同 revision 保存的 `409`、进入真实 WebGL 编辑器再删除测试数据：

```bash
set -a && source .env && set +a
docker compose up -d postgres redis minio minio-init
pnpm --filter @digital-twin/api-server exec prisma migrate deploy
E2E_DATABASE=true E2E_API_BASE_URL=http://127.0.0.1:3100/api pnpm test:e2e
```

本机 `3000` 端口被其他项目占用时，上述验收默认在 `3100` 启动 API，不会停止或修改其他容器。

### 真实模型上传闭环

下列用例会从真实 Chromium 上传最小 GLB，等待 Worker 完成 SHA-256、元数据和缩略图，然后验证场景引用删除保护。编辑器/运行时端口同样可以覆盖，避免干扰其他本地项目：

```bash
set -a && source .env && set +a
docker compose up -d postgres redis minio minio-init
pnpm --filter @digital-twin/api-server exec prisma migrate deploy
E2E_DATABASE=true \
E2E_API_BASE_URL=http://127.0.0.1:3100/api \
E2E_EDITOR_BASE_URL=http://127.0.0.1:5273 \
E2E_RUNTIME_BASE_URL=http://127.0.0.1:5274 \
pnpm exec playwright test tests/e2e/asset-upload.spec.ts
```

中文注释要求见 [docs/COMMENTING.md](docs/COMMENTING.md)，完整架构见 [设计文档](docs/superpowers/specs/2026-07-16-digital-twin-scene-platform-design.md)。
