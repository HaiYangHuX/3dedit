import { Mesh } from 'three';
import type { SceneNode } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import { EditorEngine } from '../src/index.js';

describe('EditorEngine model part selection', () => {
  it('保持业务根选择但只高亮目标 Mesh，并卸下内部对象变换手柄', () => {
    const mesh = new Mesh();
    const setSelection = vi.fn();
    const setObjects = vi.fn();
    const setTransformSelection = vi.fn();
    const engine = new EditorEngine();

    // EditorEngine 初始化依赖 WebGL；此处只注入二级选择所需的最小协作者以验证边界契约。
    Object.assign(engine, {
      documentSystem: {
        getModelPartObject: vi.fn(() => mesh),
      },
      selectionSystem: {
        setSelection,
        getSelection: vi.fn(() => ({ ids: ['model'], primaryId: 'model' })),
      },
      selectionHighlight: { setObjects },
      transformSystem: { setSelection: setTransformSelection },
    });

    expect(engine.selectModelPart('model', mesh.uuid)).toBe(true);
    expect(setSelection).toHaveBeenCalledWith(['model'], 'model');
    expect(setObjects).toHaveBeenCalledWith([mesh]);
    expect(setTransformSelection).toHaveBeenLastCalledWith(null);

    engine.setSelection(['model'], 'model');
    expect(setTransformSelection).toHaveBeenLastCalledWith('model');
  });

  it('拒绝不属于指定模型根的过期 UUID', () => {
    const setSelection = vi.fn();
    const setTransformSelection = vi.fn();
    const engine = new EditorEngine();
    Object.assign(engine, {
      documentSystem: { getModelPartObject: vi.fn(() => undefined) },
      selectionSystem: {
        setSelection,
        getSelection: vi.fn(() => ({ ids: ['model'], primaryId: 'model' })),
      },
      transformSystem: { setSelection: setTransformSelection },
    });

    expect(engine.selectModelPart('model', 'expired-object')).toBe(false);
    expect(setSelection).toHaveBeenCalledWith(['model'], 'model');
    expect(setTransformSelection).toHaveBeenCalledWith('model');
  });

  it('更新或删除其他节点后恢复仍然有效的二级精确高亮', async () => {
    const owner = new Mesh();
    const part = new Mesh();
    owner.add(part);
    const setObjects = vi.fn();
    const selection = { ids: ['model'], primaryId: 'model' };
    const setSelection = vi.fn(() => setObjects([owner]));
    const documentSystem = {
      getModelPartObject: vi.fn(() => part),
      updateNode: vi.fn().mockResolvedValue(undefined),
      removeNodes: vi.fn(),
      getStats: vi.fn(() => ({
        objectCount: 2,
        meshCount: 2,
        vertexCount: 0,
        faceCount: 0,
      })),
    };
    const engine = new EditorEngine();
    Object.assign(engine, {
      documentSystem,
      selectionSystem: {
        setSelection,
        getSelection: vi.fn(() => selection),
      },
      selectionHighlight: { setObjects },
      transformSystem: { setSelection: vi.fn() },
    });
    expect(engine.selectModelPart('model', part.uuid)).toBe(true);

    const node: SceneNode = {
      id: 'model',
      parentId: null,
      childIds: [],
      name: '模型',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [{ kind: 'model', assetId: 'asset-1' }],
      businessData: {},
    };
    await engine.updateNode(node);
    expect(setObjects).toHaveBeenLastCalledWith([part]);

    engine.removeNodes(['unrelated-node']);
    expect(setObjects).toHaveBeenLastCalledWith([part]);
  });
});
