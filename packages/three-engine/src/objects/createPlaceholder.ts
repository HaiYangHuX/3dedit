import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
} from 'three';

/** 资源错误仍保留业务节点和选择体，避免一个损坏模型阻断整份场景。 */
export function createAssetPlaceholder(
  assetId: string,
  message: string,
): Group {
  const root = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const body = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: '#7f1d1d',
      transparent: true,
      opacity: 0.5,
    }),
  );
  const outline = new LineSegments(
    new EdgesGeometry(geometry),
    new LineBasicMaterial({ color: '#fca5a5' }),
  );
  root.add(body, outline);
  root.userData.assetId = assetId;
  root.userData.loadError = message;
  root.userData.isAssetPlaceholder = true;
  return root;
}
