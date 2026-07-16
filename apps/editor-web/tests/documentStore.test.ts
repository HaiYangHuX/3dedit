import type { SceneDetail } from '@digital-twin/api-contracts';
import { AddNodeCommand } from '@digital-twin/editor-core';
import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client';
import { projectApi } from '../src/api/projects';
import { useDocumentStore } from '../src/stores/document';

vi.mock('../src/api/projects', () => ({
  projectApi: {
    getScene: vi.fn(),
    saveScene: vi.fn(),
  },
}));

function createSceneDetail(revision = 0): SceneDetail {
  const document = createDefaultSceneDocument('project-1', 'scene-1', '场景一');
  document.revision = revision;
  return {
    id: 'scene-1',
    projectId: 'project-1',
    name: '场景一',
    sortOrder: 0,
    revision,
    document,
    contentHash: '',
    coverKey: null,
    createdAt: '2026-07-16T06:00:00.000Z',
    updatedAt: '2026-07-16T06:00:00.000Z',
  };
}

describe('useDocumentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('从 API 加载完整场景文档', async () => {
    vi.mocked(projectApi.getScene).mockResolvedValue(createSceneDetail(2));
    const store = useDocumentStore();

    await store.loadScene('scene-1');

    expect(store.document.id).toBe('scene-1');
    expect(store.document.revision).toBe(2);
    expect(store.saveState).toBe('saved');
  });

  it('标记变更后在 1500ms 自动保存', async () => {
    vi.useFakeTimers();
    vi.mocked(projectApi.getScene).mockResolvedValue(createSceneDetail(0));
    vi.mocked(projectApi.saveScene).mockResolvedValue(createSceneDetail(1));
    const store = useDocumentStore();
    await store.loadScene('scene-1');

    store.document.name = '修改后的场景';
    store.markDirty();
    await vi.advanceTimersByTimeAsync(1500);

    expect(projectApi.saveScene).toHaveBeenCalledWith(
      'scene-1',
      expect.objectContaining({ baseRevision: 0 }),
    );
    expect(store.document.revision).toBe(1);
    expect(store.saveState).toBe('saved');
  });

  it('409 时保留本地文档并进入 conflict', async () => {
    vi.mocked(projectApi.getScene).mockResolvedValue(createSceneDetail(3));
    vi.mocked(projectApi.saveScene).mockRejectedValue(
      new ApiError(409, 'REVISION_CONFLICT', '场景已被修改'),
    );
    const store = useDocumentStore();
    await store.loadScene('scene-1');
    store.document.name = '本地未保存名称';
    store.markDirty();

    await expect(store.save()).rejects.toBeInstanceOf(ApiError);

    expect(store.document.name).toBe('本地未保存名称');
    expect(store.saveState).toBe('conflict');
  });

  it('命令会标记 dirty、维护资源引用并可撤销', async () => {
    vi.mocked(projectApi.getScene).mockResolvedValue(createSceneDetail());
    const store = useDocumentStore();
    await store.loadScene('scene-1');
    const modelNode = {
      id: 'model-1',
      parentId: null,
      childIds: [],
      name: '水泵',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
      components: [{ kind: 'model' as const, assetId: 'asset-1' }],
      businessData: {},
    };

    await store.execute(new AddNodeCommand(modelNode));

    expect(store.saveState).toBe('dirty');
    expect(store.canUndo).toBe(true);
    expect(store.document.assetReferences).toEqual([
      { assetId: 'asset-1', nodeIds: ['model-1'] },
    ]);

    await store.undo();
    expect(store.document.nodes['model-1']).toBeUndefined();
    expect(store.canRedo).toBe(true);
  });

  it('成功保存后将当前历史游标标记为 clean', async () => {
    vi.mocked(projectApi.getScene).mockResolvedValue(createSceneDetail());
    vi.mocked(projectApi.saveScene).mockImplementation(
      async (_sceneId, input) => ({
        ...createSceneDetail(input.baseRevision + 1),
        document: {
          ...structuredClone(input.document),
          revision: input.baseRevision + 1,
        },
      }),
    );
    const store = useDocumentStore();
    await store.loadScene('scene-1');
    store.document.name = '已修改';
    store.markDirty();

    await store.save();

    expect(store.saveState).toBe('saved');
    expect(store.isHistoryDirty).toBe(false);
  });
});
