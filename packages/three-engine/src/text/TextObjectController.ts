import type { TextComponent } from '@digital-twin/scene-schema';
import {
  CanvasTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { renderTextCanvas } from './TextCanvasFactory.js';

export interface CreateTextObjectOptions {
  renderCanvas?: (component: TextComponent) => HTMLCanvasElement;
}

type TextDisplay = Sprite | Mesh<PlaneGeometry, MeshBasicMaterial>;

interface TextObjectController {
  component: TextComponent;
  renderCanvas(component: TextComponent): HTMLCanvasElement;
  display: TextDisplay;
}

const controllers = new WeakMap<Object3D, TextObjectController>();

function createTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createDisplay(
  component: TextComponent,
  canvas: HTMLCanvasElement,
): TextDisplay {
  const texture = createTexture(canvas);
  const aspect = canvas.width / Math.max(canvas.height, 1);
  if (component.textType === 'Mesh') {
    const mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: texture,
        side: DoubleSide,
        transparent: true,
        alphaTest: 0.1,
        depthWrite: true,
      }),
    );
    mesh.castShadow = true;
    mesh.scale.set(aspect, 1, 1);
    mesh.userData.textDisplay = true;
    return mesh;
  }
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: true,
    }),
  );
  sprite.scale.set(aspect, 1, 1);
  sprite.userData.textDisplay = true;
  return sprite;
}

function displayMaterial(
  display: TextDisplay,
): SpriteMaterial | MeshBasicMaterial {
  return display.material;
}

function disposeDisplay(display: TextDisplay): void {
  const material = displayMaterial(display);
  material.map?.dispose();
  material.dispose();
  if (display instanceof Mesh) display.geometry.dispose();
}

function writeMetadata(root: Group, component: TextComponent): void {
  root.userData.textMethod = component.textMethod;
  root.userData.textType = component.textType;
  root.userData.color = component.color;
  root.userData.fontSize = component.fontSize;
  root.userData.textContent = component.textContent;
  root.userData.isTextObject = true;
}

function controllerOf(root: Object3D): TextObjectController | undefined {
  return controllers.get(root);
}

export function createTextObject(
  component: TextComponent,
  options: CreateTextObjectOptions = {},
): Group {
  const root = new Group();
  const renderCanvas = options.renderCanvas ?? renderTextCanvas;
  const display = createDisplay(component, renderCanvas(component));
  root.add(display);
  controllers.set(root, {
    component: structuredClone(component),
    renderCanvas,
    display,
  });
  writeMetadata(root, component);
  return root;
}

/**
 * 同类型更新只替换纹理；类型切换才替换子节点。业务根始终稳定，避免属性编辑
 * 让选择框和 TransformControls 暂时指向已经释放的对象。
 */
export function updateTextObject(
  root: Object3D,
  component: TextComponent,
): boolean {
  const controller = controllerOf(root);
  if (!controller) return false;
  const canvas = controller.renderCanvas(component);
  if (controller.component.textType === component.textType) {
    const material = displayMaterial(controller.display);
    const previous = material.map;
    material.map = createTexture(canvas);
    material.needsUpdate = true;
    controller.display.scale.set(
      canvas.width / Math.max(canvas.height, 1),
      1,
      1,
    );
    previous?.dispose();
  } else {
    const next = createDisplay(component, canvas);
    root.add(next);
    controller.display.removeFromParent();
    disposeDisplay(controller.display);
    controller.display = next;
  }
  controller.component = structuredClone(component);
  writeMetadata(root as Group, component);
  return true;
}

export function setTextObjectContent(root: Object3D, text: string): boolean {
  const controller = controllerOf(root);
  if (!controller) return false;
  return updateTextObject(root, { ...controller.component, textContent: text });
}

/** 控制器只释放更新期私有状态；最终 Three 资源由文档系统统一遍历释放。 */
export function releaseTextObjectController(root: Object3D): boolean {
  if (!controllers.has(root)) return false;
  controllers.delete(root);
  return true;
}

export function getTextObjectComponent(
  root: Object3D,
): TextComponent | undefined {
  const component = controllerOf(root)?.component;
  return component ? structuredClone(component) : undefined;
}

export type TextObjectMaterial = Material & { map?: Texture | null };
