-- releaseId 只是对象存储原子切换键，不创建用户可见的发布历史表。
ALTER TABLE "Publication"
ADD COLUMN "releaseId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "sceneObjectKey" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Publication"
ALTER COLUMN "releaseId" DROP DEFAULT,
ALTER COLUMN "sceneObjectKey" DROP DEFAULT;
