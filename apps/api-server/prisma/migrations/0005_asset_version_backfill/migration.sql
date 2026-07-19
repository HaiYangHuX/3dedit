-- 为迁移前已经存在的资源补齐首个版本，详情页不会出现空白版本时间线。
INSERT INTO "AssetVersion" (
  "id", "assetId", "version", "notes", "status", "sourceFileId",
  "metadata", "createdAt", "publishedAt"
)
SELECT
  CONCAT('legacy-', a."id"),
  a."id",
  a."version",
  a."versionNotes",
  CASE WHEN a."status" = 'ready' THEN 'ready' ELSE 'processing' END,
  a."activeFileId",
  a."metadata",
  a."createdAt",
  CASE WHEN a."status" = 'ready' THEN a."updatedAt" ELSE NULL END
FROM "Asset" a
ON CONFLICT ("assetId", "version") DO NOTHING;
