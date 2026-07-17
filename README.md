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
node --version # 要求 v24.x
corepack prepare pnpm@10.12.1 --activate
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @digital-twin/api-server exec prisma migrate deploy
pnpm dev
```

默认端口：编辑器 `5173`、运行时 `5174`、API `3000`、PostgreSQL `5432`、Redis `6379`、MinIO `9000/9001`。当本机端口被占用时，可在 `.env` 中同步调整 `*_PORT`、`DATABASE_URL` 和 `REDIS_URL`。

`pnpm dev` 会同时启动 `asset-worker`。上传流程为浏览器分块计算 SHA-256 → 3 路并发直传 MinIO → API 完成 Multipart → BullMQ Worker 校验并解析 → 原子切换可用源文件。请勿只启动 Web 与 API 而遗漏 Worker。

`predev` 和 `prebuild` 会自动执行 `pnpm copy:three-decoders`，将当前锁定的 Three.js r183 Draco/Basis 运行文件复制到两个 Web 应用。若只单独启动某个 Vite 应用，请先手动执行该复制命令。

## 模型与素材库

- 支持 GLB、GLTF、FBX、OBJ、STL、USDZ、HDR、PNG/JPG/WEBP/SVG、MP4/WEBM。
- 文件至少按 5 MiB 分片，API 不接收完整文件字节；MinIO 预签名 PUT 响应通过服务级 CORS 暴露 `ETag`。
- GLB/GLTF 会统计顶点、面、Mesh、材质、贴图、动画、相机、包围盒及 Draco/Meshopt/KTX2 扩展。
- 解析成功前不会替换当前可用源文件；失败任务可重试。
- 被当前场景引用的资源不能删除，接口返回 `ASSET_IN_USE` 409。
- 编辑器左侧模型面板与模型库页面复用同一个 Asset Pinia；模型、几何体和灯光使用同一个强类型拖放 MIME，不依赖全局“当前拖拽对象”。

## 场景编辑器

- 工作台按 ThreeFlowX 的高密度比例组织为 33px 顶栏、180px 竖向资源区、中央视口和 340px 检查器；统计浮层与方向方块不占用画布布局空间。
- 新建编辑场景对齐 ThreeFlowX r183 的 `#3b3b3b` 背景、曝光 `1.2`、`FogExp2(0.01)` 和 2000/200 分段双层网格；没有用户 HDR 时使用 Three.js r183 官方 `venice_sunset_1k.hdr` 和相同 90° 环境旋转提供编辑器专用 IBL，发布运行时不会携带这些辅助资源。
- 同一场景可实例化多个模型，并支持立方体、球体、平面、圆柱体和五种灯光。
- 场景树、视口射线选择、黄色 BoxHelper 和属性面板通过 SceneNode ID 双向同步；编辑器选中不再用白色 OutlinePass 覆盖复杂模型表面，发布运行时的交互 Outline 保持独立。
- TransformControls 提供移动、旋转、缩放、local/world 空间、网格吸附；`W/E/R/F`、`Delete`、`Cmd/Ctrl+Z` 可用。视口工具条还支持六向视图、相机重置、PNG 截图和视口全屏。
- 模型、几何体和灯光的拖放位置都由 canvas 相对射线与 `y=0` 平面求交，不受左右面板宽度影响；几何体和灯光的默认中心高度最低为 `0.5`。
- 节点增删、变换、属性、层级、场景背景/曝光/网格均纳入命令历史和自动保存。

### PBR 材质与贴图

- 模型和基础几何体支持节点级材质覆盖，覆盖范围是该节点下全部 Mesh；“恢复原始”会回到模型资源自带材质或几何体默认材质。
- 支持 Standard、Physical、Phong、Basic，以及颜色、透明、线框、渲染面、深度、阴影、粗糙度、金属度、发光、清漆、反射率、高光和法线强度。
- Base Color、Normal、Roughness、Metalness、AO、Emissive 六类贴图都保存独立素材 ID、offset、repeat、rotation 与包裹方式。
- Base Color/Emissive 使用 sRGB，数据贴图保持无颜色空间；异步贴图通过场景代次丢弃迟到结果，覆盖 Material/Texture clone 在更新、恢复和销毁时对称释放。
- 贴图资源与模型/HDR 一起进入服务端重建的 `assetReferences` 和独立发布包，草稿预览与正式运行时使用同一个 `MaterialSystem`。
- 当前周期有意采用节点级统一覆盖；子网格/材质槽分别配置将在模型解析生成稳定 slot ID 后扩展，避免持久化不稳定遍历下标。

## 交互、WebSocket 与运行时

- 右侧“交互事件”可配置加载、单/双击、鼠标进出、定时、WebSocket 和变量触发器，并用递归 AND/OR 条件树执行串行或并行动作。
- 条件和动作是 Zod 强类型声明式协议，运行时不执行任意 JavaScript、`eval` 或模板脚本。
- 右侧“Socket 任务”支持心跳、指数退避重连、重连上限、消息模拟，以及位置、旋转、缩放、显隐、颜色、文本、图表、视频、动画和相机任务映射。
- 路由 `http://127.0.0.1:5174/preview/:sceneId` 读取当前草稿；`http://127.0.0.1:5174/runtime/:publicationId` 只读取已发布 Manifest 及其独立资源副本。

WebSocket 任务消息使用 `taskCode` 匹配编辑器配置，消息中的 `taskType`、`taskTime` 和 `taskData` 可在通过协议校验后覆盖默认值：

```json
{
  "taskCode": "device-position",
  "taskTime": 300,
  "taskData": { "x": 10, "y": 0, "z": 5 }
}
```

运行时也接受由上述对象组成的 JSON 数组，数组内任务依次进入强类型映射器。

## 预览与发布

1. 在编辑器点击“预览”会先保存脏文档，再打开草稿运行时。预览页会展示 Socket 状态和最近运行诊断。
2. 点击“发布”会把 Scene JSON、Manifest 和当前活动模型、HDR、材质贴图复制到 `publications/{publicationId}/releases/{releaseId}/`。
3. 只有完整发布包写入成功后，PostgreSQL 中每个项目唯一的 Publication 指针才会原子切换；失败不会改变已有线上场景。
4. 重复发布保持同一 `publicationId`，成功后异步清理旧的内部 release，不向用户暴露业务版本列表。

发布结果会同时给出访问地址和 iframe 代码：

```html
<iframe
  src="http://127.0.0.1:5174/runtime/PUBLICATION_ID"
  width="100%"
  height="100%"
  frameborder="0"
  allowfullscreen
></iframe>
```

## Three.js Decoder 与 HDR

- Three.js 运行时和类型声明精确锁定为 `0.183.0` / `0.183.1`，Decoder 不从 CDN 漂移加载。
- `scripts/copy-three-decoders.mjs` 只从 `three/examples/jsm/libs/draco/gltf` 和 `three/examples/jsm/libs/basis` 复制白名单 JS/WASM；任意文件缺失都会让构建立即失败。
- 生成的 Decoder 文件被 `.gitignore` 排除，仓库仅保留目录与复制规则；线上部署必须保留 `/decoders/draco/` 和 `/decoders/basis/` 静态路径。
- 默认环境来自本地 `/hdr/venice_sunset_1k.hdr`，SHA-256 与 Three.js r183 官方示例一致；`RoomEnvironment` 只在该静态文件部署失败时兜底。用户 HDR 由 r183 `HDRLoader + PMREMGenerator` 转换，新环境成功前保留旧环境，清除后恢复 Venice 默认环境；路由切换或销毁后的迟到纹理会被立即释放。渲染循环使用 `Timer`，USDZ 使用 `USDLoader`，不实例化 r183 已弃用入口。

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

### 真实多模型编辑闭环

下列用例会在真实 Chromium 中上传 GLB，向同一场景添加两个模型实例和点光源，执行变换、撤销/重做、保存与刷新还原，最后对照 API SceneDocument 和 WebGL 业务对象数：

```bash
set -a && source .env && set +a
docker compose up -d postgres redis minio minio-init
pnpm --filter @digital-twin/api-server exec prisma migrate deploy
E2E_DATABASE=true \
E2E_API_BASE_URL=http://127.0.0.1:3100/api \
E2E_EDITOR_BASE_URL=http://127.0.0.1:5273 \
E2E_RUNTIME_BASE_URL=http://127.0.0.1:5274 \
pnpm exec playwright test tests/e2e/scene-editing.spec.ts
```

### 真实交互、WebSocket 与发布闭环

下列用例会启动随机端口 WebSocket fixture，创建多模型场景，在编辑器内配置点击交互和 Socket 任务，验证草稿预览、发布运行时、MinIO 复制失败保护、同一 Publication 指针替换及旧 release 清理：

```bash
set -a && source .env && set +a
docker compose up -d postgres redis minio minio-init
E2E_DATABASE=true \
E2E_API_BASE_URL=http://127.0.0.1:3100/api \
E2E_EDITOR_BASE_URL=http://127.0.0.1:5273 \
E2E_RUNTIME_BASE_URL=http://127.0.0.1:5274 \
pnpm exec playwright test tests/e2e/runtime-publication.spec.ts
```

Playwright 后端启动脚本会先自动执行 `prisma migrate deploy`，不需要在验收命令前重复手工应用 migration。

中文注释要求见 [docs/COMMENTING.md](docs/COMMENTING.md)，完整架构见 [设计文档](docs/superpowers/specs/2026-07-16-digital-twin-scene-platform-design.md)。
