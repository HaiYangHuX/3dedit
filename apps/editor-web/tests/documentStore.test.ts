import type { SceneDetail } from '@digital-twin/api-contracts';
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
});
