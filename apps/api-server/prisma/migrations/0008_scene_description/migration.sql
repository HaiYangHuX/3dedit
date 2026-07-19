-- 场景描述是管理元数据，不进入 Three.js 场景文档，兼容已有场景默认空值。
ALTER TABLE "Scene"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
