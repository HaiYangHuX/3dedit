import { Box3, type Object3D } from 'three';

const DEFAULT_GROUND_Y = 0.01;

/**
 * 将一个业务根节点的世界包围盒最低点抬到源站地面线以上。
 * 工具辅助对象不属于业务模型，必须跳过，否则测量线会改变场景整体高度。
 */
export function alignObjectToGround(
  object: Object3D,
  groundY = DEFAULT_GROUND_Y,
): number {
  if (object.userData.isEditorHelper === true) return 0;

  object.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(object);
  if (
    bounds.isEmpty() ||
    !Number.isFinite(bounds.min.y) ||
    !Number.isFinite(bounds.max.y)
  ) {
    return 0;
  }

  const offset = groundY - bounds.min.y;
  if (!Number.isFinite(offset) || Math.abs(offset) < Number.EPSILON) {
    return 0;
  }

  object.position.y += offset;
  object.updateMatrixWorld(true);
  return offset;
}
