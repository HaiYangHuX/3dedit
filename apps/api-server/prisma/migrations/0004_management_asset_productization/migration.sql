-- 产品化管理字段：项目基础资料、资源元数据及资源版本历史。
ALTER TABLE "Project"
  ADD COLUMN "code" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ownerName" TEXT NOT NULL DEFAULT '平台管理员',
  ADD COLUMN "industry" TEXT NOT NULL DEFAULT '制造业',
  ADD COLUMN "location" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Asset"
  ADD COLUMN "code" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "version" TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN "versionNotes" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "author" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "manufacturer" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "license" TEXT NOT NULL DEFAULT '内部资产',
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'm',
  ADD COLUMN "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN "coverAssetId" TEXT;

CREATE INDEX "Asset_coverAssetId_idx" ON "Asset"("coverAssetId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_coverAssetId_fkey"
  FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UploadSession"
  ADD COLUMN "version" TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN "versionNotes" TEXT NOT NULL DEFAULT '';

CREATE TABLE "AssetVersion" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'processing',
  "sourceFileId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetVersion_assetId_version_key"
  ON "AssetVersion"("assetId", "version");

CREATE INDEX "AssetVersion_assetId_createdAt_idx"
  ON "AssetVersion"("assetId", "createdAt");

ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_sourceFileId_fkey"
  FOREIGN KEY ("sourceFileId") REFERENCES "AssetFile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
