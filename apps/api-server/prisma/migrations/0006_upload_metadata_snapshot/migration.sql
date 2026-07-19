-- 上传会话保存待提交的资源卡片快照，取消替换上传时不会污染当前版本元数据。
ALTER TABLE "UploadSession"
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
