import type { SceneNode } from '@digital-twin/scene-schema';
import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  SpotLight,
  type BufferGeometry,
  type Light,
  type Object3D,
} from 'three';
import type { AssetInstanceProvider } from '../types.js';

export function createPrimitiveGeometry(
  primitive: 'box' | 'sphere' | 'plane' | 'cylinder',
): BufferGeometry {
  return {
    box: () => new BoxGeometry(1, 1, 1),
    sphere: () => new SphereGeometry(0.5, 32, 16),
    plane: () => new PlaneGeometry(1, 1),
    cylinder: () => new CylinderGeometry(0.5, 0.5, 1, 32),
  }[primitive]();
}

function geometryObject(
  primitive: 'box' | 'sphere' | 'plane' | 'cylinder',
): Mesh {
  const geometry = createPrimitiveGeometry(primitive);
  return new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.72,
      metalness: 0.08,
    }),
  );
}

function lightObject(
  component: Extract<SceneNode['components'][number], { kind: 'light' }>,
): Light {
  let light: Light;
  switch (component.lightType) {
    case 'ambient':
      light = new AmbientLight(component.color, component.intensity);
      break;
    case 'directional':
      light = new DirectionalLight(component.color, component.intensity);
      break;
    case 'hemisphere':
      light = new HemisphereLight(
        component.color,
        '#1e293b',
        component.intensity,
      );
      break;
    case 'point':
      light = new PointLight(component.color, component.intensity, 0, 2);
      break;
    case 'spot':
      light = new SpotLight(
        component.color,
        component.intensity,
        0,
        Math.PI / 6,
        0.2,
        2,
      );
      break;
  }
  if ('castShadow' in light) light.castShadow = component.castShadow;
  return light;
}

export function applySceneNode(root: Object3D, node: SceneNode): void {
  root.name = node.name;
  root.visible = node.enabled;
  root.position.fromArray(node.transform.position);
  root.rotation.fromArray([...node.transform.rotation, 'XYZ']);
  root.scale.fromArray(node.transform.scale);
  root.userData.sceneNodeId = node.id;
  root.userData.locked = node.locked;
}

/** 按首个可渲染组件创建业务根；附加业务组件仍完整保留在 SceneDocument。 */
export async function createSceneObject(
  node: SceneNode,
  assets: AssetInstanceProvider,
  generation: number,
): Promise<Object3D> {
  const model = node.components.find((component) => component.kind === 'model');
  let root: Object3D;
  if (model?.kind === 'model') {
    root = await assets.instantiate(model.assetId, generation);
  } else {
    const geometry = node.components.find(
      (component) => component.kind === 'geometry',
    );
    const light = node.components.find(
      (component) => component.kind === 'light',
    );
    if (geometry?.kind === 'geometry') {
      root = geometryObject(geometry.primitive);
      root.userData.geometryPrimitive = geometry.primitive;
    } else if (light?.kind === 'light') root = lightObject(light);
    else root = new Group();
  }
  applySceneNode(root, node);
  root.userData.componentKinds = node.components.map(({ kind }) => kind);
  return root;
}
