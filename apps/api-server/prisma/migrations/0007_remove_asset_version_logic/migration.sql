-- 版本仅作为 Asset.version 普通字段保存，移除历史版本表和上传会话版本状态字段。
DROP TABLE "AssetVersion";

ALTER TABLE "Asset"
  DROP COLUMN "versionNotes";

ALTER TABLE "UploadSession"
  DROP COLUMN "version",
  DROP COLUMN "versionNotes";
