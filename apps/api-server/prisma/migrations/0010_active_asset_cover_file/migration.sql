ALTER TABLE "Asset"
ADD COLUMN "activeCoverFileId" TEXT;

CREATE UNIQUE INDEX "Asset_activeCoverFileId_key"
ON "Asset"("activeCoverFileId");

ALTER TABLE "Asset"
ADD CONSTRAINT "Asset_activeCoverFileId_fkey"
FOREIGN KEY ("activeCoverFileId") REFERENCES "AssetFile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
