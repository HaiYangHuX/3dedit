import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { alignObjectToGround } from '../src/interaction/SceneAlignmentSystem.js';

describe('SceneAlignmentSystem', () => {
  it('按世界包围盒最低点把模型根节点落到地面上方', () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(2, 4, 2), new MeshBasicMaterial()));
    root.position.y = -3;
    root.updateMatrixWorld(true);

    const offset = alignObjectToGround(root);

    expect(offset).toBeCloseTo(5.01);
    expect(root.position.y).toBeCloseTo(2.01);
    root.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
  });

  it('空对象或辅助对象不会产生对齐偏移', () => {
    const empty = new Group();
    const helper = new Group();
    helper.userData.isEditorHelper = true;

    expect(alignObjectToGround(empty)).toBe(0);
    expect(alignObjectToGround(helper)).toBe(0);
  });
});
