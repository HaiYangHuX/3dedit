import { Box3, Group, Mesh, Vector3, type Object3D } from 'three';

/** 数字孪生 4.0.4 在线 bundle 中拖入模型的最大边目标值。 */
export const SOURCE_MODEL_TARGET_SIZE = 1.5;

/**
 * 源站对最大边不超过 1 的模型固定使用 0.5 作为分母。
 * 该规则看似特殊，但必须保留，否则小模型会与原站出现另一套初始比例。
 */
export const SOURCE_SMALL_MODEL_BASE_SIZE = 0.5;

/**
 * 复现源站 `Box3 -> maxSize -> 1.5 / denominator` 的模型导入变换。
 *
 * 归一化放在内部 content，而不是业务根上：SceneNode 初始 scale 仍为 1，
 * 后续 TransformControls 和属性面板不会把导入补偿比例误写回场景文档。
 */
export function createNormalizedModelInstance(content: Object3D): Group {
  content.updateMatrixWorld(true);
  const size = new Box3().setFromObject(content).getSize(new Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const denominator =
    Number.isFinite(maxSize) && maxSize > 1
      ? maxSize
      : SOURCE_SMALL_MODEL_BASE_SIZE;
  const normalizationScale = SOURCE_MODEL_TARGET_SIZE / denominator;

  // 源站在加入场景前会覆盖模型根位置；业务落点由外层 SceneNode 根统一承担。
  content.position.set(0, 0, 0);
  content.scale.setScalar(normalizationScale);
  content.userData.isNormalizedModelContent = true;
  content.userData.sourceBoundsSize = size.toArray();
  content.userData.sourceNormalizationScale = normalizationScale;
  content.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    // 与线上 Ws(model, point) 一致，模型实例默认参与投射和接收阴影。
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const instance = new Group();
  instance.name = content.name;
  instance.userData = { ...content.userData };
  instance.userData.isNormalizedModelContent = false;
  instance.userData.modelNormalization = {
    targetSize: SOURCE_MODEL_TARGET_SIZE,
    sourceSize: size.toArray(),
    scale: normalizationScale,
  };
  instance.receiveShadow = true;
  instance.add(content);
  // scale 是在 content 已经计算过一次矩阵后写入的；立即刷新整棵子树，
  // 否则 GLTF 内部带有大坐标平移的 Mesh 会沿用旧 matrixWorld，渲染器会把它画到错误位置。
  instance.updateMatrixWorld(true);
  return instance;
}
