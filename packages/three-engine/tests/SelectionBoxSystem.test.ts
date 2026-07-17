import {
  BoxGeometry,
  BoxHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SelectionBoxSystem } from '../src/interaction/SelectionBoxSystem.js';

function modelRoot(name: string): Group {
  const root = new Group();
  root.name = name;
  root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  return root;
}

function selectionHelpers(scene: Scene): BoxHelper[] {
  return scene.children.filter(
    (child): child is BoxHelper => child instanceof BoxHelper,
  );
}

describe('SelectionBoxSystem', () => {
  it('为每个选中业务根对象创建不改变模型表面的黄色 BoxHelper', () => {
    const scene = new Scene();
    const left = modelRoot('left');
    const right = modelRoot('right');
    right.position.x = 2;
    scene.add(left, right);
    scene.updateMatrixWorld(true);
    const system = new SelectionBoxSystem(scene);

    system.setObjects([left, right]);

    const helpers = selectionHelpers(scene);
    expect(helpers).toHaveLength(2);
    expect(helpers.map((helper) => helper.object)).toEqual([left, right]);
    expect(
      helpers.every((helper) => helper.material.color.getHex() === 0xffff00),
    ).toBe(true);
    expect(
      helpers.every((helper) => helper.userData.editorHelper === true),
    ).toBe(true);
    system.dispose();
  });

  it('在对象变换后更新世界包围盒，并在换选和销毁时释放资源', () => {
    const scene = new Scene();
    const first = modelRoot('first');
    const second = modelRoot('second');
    scene.add(first, second);
    scene.updateMatrixWorld(true);
    const system = new SelectionBoxSystem(scene);
    system.setObjects([first]);
    const firstHelper = selectionHelpers(scene)[0]!;
    const disposeGeometry = vi.spyOn(firstHelper.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(firstHelper.material, 'dispose');

    first.position.x = 3;
    first.updateMatrixWorld(true);
    system.update();
    const positions = Array.from(
      firstHelper.geometry.getAttribute('position').array,
    );
    expect(Math.max(...positions.filter((_, index) => index % 3 === 0))).toBe(
      3.5,
    );

    system.setObjects([second]);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(firstHelper.parent).toBeNull();

    const secondHelper = selectionHelpers(scene)[0]!;
    const disposeSecondGeometry = vi.spyOn(secondHelper.geometry, 'dispose');
    const disposeSecondMaterial = vi.spyOn(secondHelper.material, 'dispose');
    system.dispose();
    expect(disposeSecondGeometry).toHaveBeenCalledOnce();
    expect(disposeSecondMaterial).toHaveBeenCalledOnce();
    expect(selectionHelpers(scene)).toHaveLength(0);
  });
});
