import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EditorEngine } from '../src/index.js';

describe('EditorEngine ground alignment', () => {
  it('returns schema-compatible three-component rotations', () => {
    const engine = new EditorEngine();
    const root = new Group();
    const model = new Group();
    const geometry = new BoxGeometry(2, 4, 2);
    const material = new MeshBasicMaterial();

    model.add(new Mesh(geometry, material));
    model.position.y = -3;
    model.rotation.set(0.1, 0.2, 0.3, 'YXZ');
    root.add(model);
    Object.assign(engine, {
      documentSystem: {
        root,
        getNodeId: vi.fn(() => 'node-1'),
        getStats: vi.fn(() => ({
          objectCount: 1,
          meshCount: 1,
          vertexCount: 24,
          faceCount: 12,
        })),
      },
    });

    const [change] = engine.alignModelsToGround();

    expect(change?.before.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(change?.after.rotation).toEqual([0.1, 0.2, 0.3]);
    geometry.dispose();
    material.dispose();
  });
});
