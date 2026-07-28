# 模型封面附件化设计

## 背景与目标

当前模型编辑表单通过普通资源上传流程创建封面图片 `Asset`，再把该图片的 ID 写入模型的 `coverAssetId`。因为资源列表会展示全部 `Asset`，上传封面后会出现一张新的图片资源卡片。

修复后的封面只属于模型自身：它作为模型的 `AssetFile` 附件保存，不创建独立 `Asset`，不出现在模型与素材库列表中，也不参与场景资源引用计数。

## 数据模型与兼容性

- 复用现有 `AssetFile`，使用 `role = 'cover'` 标识模型封面。
- `Asset.activeCoverFileId` 指向当前封面文件；历史封面文件保留，用于上传完成请求的幂等恢复，并在删除整个资源时统一清理。
- `UploadSession` 增加上传用途字段，取值为 `source` 或 `cover`，默认 `source`，以兼容现有上传请求和历史会话。
- 保留现有 `coverAssetId` 字段用于读取历史数据；新上传封面不再创建或写入该关联。
- 返回模型 DTO 时，封面选择顺序为：`activeCoverFile`、模型自身已有的 `cover` 文件、历史 `coverAssetId` 关联图片、模型解析生成的 `thumbnail`。
- 首次以附件方式上传封面后，将模型的 `coverAssetId` 清空，避免旧关联继续占用独立图片资源。

## 上传流程

上传请求增加可选字段 `purpose`：

- `source`：保持现有行为，允许创建资源或替换模型源文件，完成后进入解析队列。
- `cover`：必须提供已有资源的 `assetId`，只接受 PNG、JPG、JPEG 或 WebP，保存到 `assets/<assetId>/cover/`，完成后写入 `AssetFile(role='cover')`，不修改资源格式、源文件、状态或解析任务。模型与图片、纹理、视频等素材共用该附件语义。

封面完成响应直接返回 `ready`，前端不轮询解析状态。完成事务会创建封面文件、原子更新 `activeCoverFileId` 并标记会话完成；并发完成通过同一资源行更新串行化，最后写入的指针生效。旧封面文件不立即删除，因此旧会话在后续更换封面后仍可恢复原完成回执。

multipart 完成采用 `uploading -> completing -> uploaded -> finalizing -> completed` 状态流。MinIO 完成后先把会话持久化为 `uploaded`，再执行附件和资源更新事务；事务内原子抢占 `uploaded -> finalizing`，失败会回滚到 `uploaded`，并发输家恢复已完成回执。若数据库收尾失败，客户端重试时跳过 MinIO，只从 `uploaded` 恢复数据库记录。

`completing` 使用五分钟租约，并把本次开始时间写入 `updatedAt` 作为 fencing token，后续状态回写必须同时匹配该 token，过期请求不能覆盖新一轮完成。超过租约后检查 MinIO 对象，已存在则恢复为 `uploaded`，不存在则恢复为 `uploading` 并重试完成。MinIO complete 抛错时也先检查对象：若服务端其实已经完成，则继续数据库收尾；无法确认时保留租约等待恢复。

取消只允许抢占 `uploading` 会话，不能中止已经进入完成流程的对象；`cancelling` 同样使用租约和 fencing token，超时后可重新中止，`NoSuchUpload` 视为对象已经中止。MinIO abort 明确失败时恢复为 `uploading`，允许再次取消。会话创建后的预签名失败会删除客户端不可见的会话记录。封面对象名使用 UUID 前缀，避免同一毫秒内的并发上传发生键冲突。

新建资源并选择封面时，前端先完成源文件上传并取得模型 ID，再以 `purpose = 'cover'` 上传封面。编辑已有模型时直接将封面绑定到当前模型 ID。只编辑元数据且未选择新封面时，不发起封面上传。

## 前端行为

- `AssetFormDialog` 不再先上传一个独立封面资源。
- 通用上传 action 支持 `purpose = 'cover'`；封面完成后直接刷新对应模型详情和列表项。
- 编辑模型并上传封面后，列表仍只有原模型卡片，卡片封面刷新为新图片。
- 新建模型加封面时，只新增一个模型资源。
- 上传失败时保留对话框和用户填写内容，显示现有错误消息，不产生独立图片资源。
- 新建资源的源文件已经成功、但封面失败时，表单保留返回的资源 ID；未修改内容时再次保存只重试封面。若用户更换源文件，则替换刚创建资源的源文件；若只修改元数据，则先更新该资源再重试封面。
- 用户取消浏览器上传后，只有服务端取消成功才把任务标记为 `cancelled`；服务端暂时失败时任务恢复为 `uploading` 并保留取消入口，再次点击会直接重试服务端取消。

## 测试与验收

- API contract：验证 `cover` 必须绑定 `assetId` 且限制图片格式。
- UploadService：验证封面会话不创建 `Asset`、对象键位于 `cover` 目录、完成后写入 `role='cover'` 并更新当前封面指针、不删除历史封面、不创建解析任务且不改变资源状态。
- UploadService 恢复性：验证封面键在同一时刻仍唯一、MinIO 完成后先写入 `uploaded`、重试 `uploaded` 会话不再次调用 MinIO、并发收尾恢复同一回执、超时 `completing` 可恢复、模糊完成响应按对象状态恢复、旧请求受 fencing token 隔离、完成流程开始后取消不抢占会话、超时 `cancelling` 可恢复、abort 失败可重试、预签名失败不残留会话。
- AssetService：验证当前封面指针优先于历史关联封面和自动缩略图，并覆盖各级回退。
- 前端 store：验证封面完成后不轮询解析任务，并更新原模型。
- `AssetFormDialog`：验证编辑上传封面时传入当前模型 ID 和 `purpose='cover'`；新建时先取得模型 ID 再上传封面。
- `AssetFormDialog` 重试：验证新建资源的封面失败后再次保存不重复上传源文件。
- 前端 store 取消：验证服务端取消失败时保留错误和重试入口，再次取消成功后才进入 `cancelled`。
- 回归验证：普通资源创建、源文件替换、模型解析和历史 `coverAssetId` 显示行为保持不变。
