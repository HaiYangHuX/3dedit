# 项目管理与模型素材库产品化重构设计

## 目标

将当前“项目卡片 + 直接上传资源”的极简页面升级为无账号阶段也可独立使用的后台式管理产品：统一侧边栏导航、项目工作台、场景管理、资源元数据、封面、版本历史、筛选/批量操作以及模型详情 3D 预览。

本次只重构项目管理和模型/素材库，不改编辑器核心 Three.js 交互协议；Three.js 继续固定使用当前项目的 `0.183.0`。

## 现状与问题

- 项目页只有名称、描述、场景数量，缺少状态、标签、项目编码、封面和运营信息。
- 模型库上传区域长期占据页面，上传动作没有业务元数据表单，也无法表达版本、变更说明和封面。
- Asset 只有处理状态和解析统计；源文件替换没有可读的版本历史。
- 详情抽屉只有图片和统计，没有真实模型渲染；使用者无法在入库后确认模型是否可用。
- 项目与素材库之间只有顶部链接，缺少后台管理式的连续导航和上下文。

## 设计决策

### 1. 后台式信息架构

使用 `ManagementLayout` 作为项目管理和素材库的共同壳层，保留现有 URL 以降低迁移风险：

- `/projects`：项目总览
- `/projects/:projectId`：项目工作台
- `/assets`：模型与素材库
- `/editor/:projectId/:sceneId`：编辑器全屏页面，不套后台壳层

侧边栏提供“项目管理”“模型与素材库”两个一级菜单，顶部显示当前页面标题、面包屑和快捷操作。壳层不持有业务数据，业务页面继续由 Pinia store 负责加载和错误状态。

### 2. 项目字段

`Project` 增加以下可序列化字段，均提供默认值以兼容已有数据：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | string | 项目编码，便于搜索和外部引用 |
| `status` | enum string | `draft` / `active` / `archived` |
| `tags` | string[] | 业务标签 |
| `ownerName` | string | 当前无账号体系，使用责任人文本 |
| `industry` | string | 行业分类 |
| `location` | string | 项目地点 |
| `coverKey` | string? | 封面对象键；为空时前端使用渐变首字母兜底 |
| `notes` | string | 运营备注 |

项目详情接口额外返回 `assetCount`、`sceneCount`、`lastPublishedAt` 和场景摘要。创建项目仍自动生成第一个场景；项目删除仍由服务端级联并保留最后场景保护。

### 3. 资源字段与版本

`Asset` 增加产品化元数据：

- `code`：资源编码
- `description`：用途说明
- `version`：当前激活版本号，默认 `1.0.0`
- `versionNotes`：当前版本变更说明
- `author` / `manufacturer` / `license` / `unit` / `scale`：来源和计量信息
- `coverAssetId`：可选的图片资源封面引用；没有时回退到现有解析缩略图
- `visibility`：`private` / `team` / `public`，为无账号阶段预留产品边界

新增 `AssetVersion` 表记录每次源文件入库或替换：

```text
AssetVersion(id, assetId, version, notes, status, sourceFileId,
             metadata, createdAt, publishedAt)
```

同一资源的版本号唯一；首次上传创建 `1.0.0`，替换上传默认递增 patch 版本，表单可以显式输入版本号。旧源文件不删除，当前 `activeFileId` 仍指向激活文件。版本历史只读展示，未来可以扩展版本回滚，不在本次实现回滚动作。

封面采用“素材引用”而不是把图片字节塞入 Asset 行：添加资源弹窗可以同时上传一个图片作为封面，系统先创建图片资源，再把其 ID 写入模型 `coverAssetId`；未选择封面时列表和详情自动使用解析缩略图。

### 4. 资源添加与上传流程

页面不再显示直接上传区。点击“添加资源”打开宽屏分步弹窗：

1. 基本信息：名称、编码、类型由文件格式推导、分类、标签、描述。
2. 版本与来源：版本号、版本说明、作者、厂商、许可证、单位、缩放系数。
3. 文件：模型源文件必填，封面图片可选；封面先按普通图片素材上传，完成后关联到模型。
4. 提交后显示任务进度；解析失败可以重试，关闭弹窗不会中断后台任务。

保留现有 SHA-256 + MinIO 分片上传和 Worker 解析协议。新增字段沿上传请求传递，服务端只接受 Zod 校验后的 DTO。

### 5. 详情 3D 预览

资源详情使用宽屏 `ElDrawer`，模型类资源显示真实 Three.js 预览：

- 新建 `AssetPreviewCanvas.vue`，独立拥有 `Scene`、`PerspectiveCamera`、`WebGLRenderer`、OrbitControls 和 GLTF/DRACO 加载生命周期。
- 使用 `0.183.0` 的 `GLTFLoader` 与项目现有 Draco 解码器路径。
- 自动按包围盒取景，提供重置视角、网格切换和加载状态。
- 详情关闭时销毁 renderer、controls、几何体、材质和纹理；不复用编辑器 Engine，避免资源所有权交叉。
- 非模型资源继续展示图片、文件和解析信息。

### 6. 项目工作台

项目详情改为后台工作台：

- 顶部项目概览卡：状态、场景数、资源数、最近保存、最近发布。
- 左侧场景列表：创建、复制、重命名、删除、设置默认场景、进入编辑器。
- 右侧项目设置：项目基本信息编辑、标签、责任人、行业、地点、备注、封面占位。
- 场景卡支持封面/首字母兜底和 revision 状态。

所有写操作仍显式点击保存或确认，不引入实时保存。

## 后端边界

- Prisma 增加字段和 `AssetVersion` 模型，并新增一条迁移 SQL；已有默认值保证旧行可读。
- API Contracts 先扩展 Zod schema，再更新 Nest service/controller；响应保持 ISO 日期和数字化 BigInt。
- 资源列表支持 `version`、`visibility`、`code` 搜索/筛选，详情返回 `versions` 和 `coverUrl`。
- 现有发布清单继续只读取当前激活源文件，版本历史不会改变发布协议。

## 前端边界

- `ManagementLayout.vue` 只负责导航和布局。
- `ProjectsView.vue`、`ProjectDetailView.vue`、`AssetsView.vue` 负责页面编排；表单拆分为 `ProjectFormDialog.vue`、`AssetCreateDialog.vue` 和 `AssetPreviewCanvas.vue`。
- Pinia store 只保存 DTO、筛选和上传任务，不保存 File、Three 实例或 DOM 引用。
- 全部输入使用 Element Plus 组件和主题变量；公共输入框不设置特殊超大尺寸。

## 错误与空状态

- 上传失败、重复文件、解析失败、版本号冲突分别显示可读提示。
- 资源被场景引用时禁止删除，保留服务端 `ASSET_IN_USE` 保护。
- 预览加载失败显示错误状态和“下载源文件”操作，不阻塞详情抽屉其他信息。
- 列表无数据显示筛选条件和清空筛选操作。

## 验收标准

1. `/projects` 与 `/assets` 均通过侧边栏可达，页面不再出现直接上传 Dropzone。
2. 添加资源必须经过弹窗，支持模型源文件、可选封面、版本和来源字段。
3. 未上传封面时使用解析缩略图；上传封面后列表/详情展示自定义封面。
4. 资源详情可加载真实 GLB/GLTF 模型并完成旋转、缩放、重置和销毁。
5. 资源详情能看到当前版本、版本说明和历史版本列表。
6. 项目可编辑完整项目字段，场景可创建/复制/重命名/删除/进入编辑器。
7. 既有编辑器、发布和 WebSocket 功能不回归。

