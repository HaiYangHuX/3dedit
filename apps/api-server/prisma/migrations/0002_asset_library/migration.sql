-- AlterTable
ALTER TABLE "Asset"
ADD COLUMN "category" TEXT NOT NULL DEFAULT '未分类',
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "error" TEXT,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "activeFileId" TEXT,
ALTER COLUMN "metadata" SET DEFAULT '{}',
ALTER COLUMN "status" SET DEFAULT 'uploading';

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "partSize" INTEGER NOT NULL,
    "partCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_activeFileId_key" ON "Asset"("activeFileId");
CREATE UNIQUE INDEX "UploadSession_objectKey_key" ON "UploadSession"("objectKey");
CREATE INDEX "UploadSession_assetId_status_idx" ON "UploadSession"("assetId", "status");
CREATE INDEX "UploadSession_expiresAt_status_idx" ON "UploadSession"("expiresAt", "status");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_activeFileId_fkey" FOREIGN KEY ("activeFileId") REFERENCES "AssetFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
