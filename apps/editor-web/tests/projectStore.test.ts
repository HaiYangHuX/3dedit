import type {
  ProjectDetail,
  ProjectSummary,
  SceneDetail,
} from '@digital-twin/api-contracts';
import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectApi } from '../src/api/projects';
import { useProjectStore } from '../src/stores/project';

vi.mock('../src/api/projects', () => ({
  projectApi: {
    list: vi.fn(),
    createProject: vi.fn(),
    updateScene: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

const summary: ProjectSummary = {
  id: 'project-1',
  name: '厂区',
  description: '',
  coverKey: null,
  sceneCount: 1,
  createdAt: '2026-07-16T06:00:00.000Z',
  updatedAt: '2026-07-16T06:00:00.000Z',
};
const detail: ProjectDetail = {
  ...summary,
  scenes: [],
  publicationStatus: null,
};

describe('useProjectStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('加载项目并对称恢复 loading', async () => {
    vi.mocked(projectApi.list).mockResolvedValue([summary]);
    const store = useProjectStore();

    await store.loadProjects('厂');

    expect(projectApi.list).toHaveBeenCalledWith('厂');
    expect(store.projects[0]).toEqual(expect.objectContaining(summary));
    // 运营字段由兼容层继续接收，但不再进入项目管理前端状态。
    expect(store.projects[0]).not.toHaveProperty('status');
    expect(store.projects[0]).not.toHaveProperty('ownerName');
    expect(store.projects[0]).not.toHaveProperty('tags');
    expect(store.loading).toBe(false);
    expect(store.error).toBe('');
  });

  it('创建项目后将详情设为当前项目', async () => {
    vi.mocked(projectApi.createProject).mockResolvedValue(detail);
    const store = useProjectStore();

    await expect(store.createProject('厂区', '')).resolves.toEqual(detail);
    expect(store.currentProject).toEqual(detail);
    expect(store.projects[0]).toMatchObject({ id: 'project-1', sceneCount: 1 });
  });

  it('删除当前项目时清空选择', async () => {
    vi.mocked(projectApi.list).mockResolvedValue([summary]);
    vi.mocked(projectApi.deleteProject).mockResolvedValue(undefined);
    const store = useProjectStore();
    await store.loadProjects('');
    store.currentProject = detail;

    await store.deleteProject('project-1');

    expect(store.projects).toEqual([]);
    expect(store.currentProject).toBeNull();
  });

  it('更新场景后同步当前项目中的场景名称', async () => {
    const scene: SceneDetail = {
      id: 'scene-1',
      projectId: 'project-1',
      name: '旧场景名',
      sortOrder: 0,
      revision: 0,
      document: createDefaultSceneDocument('project-1', 'scene-1', '旧场景名'),
      contentHash: '',
      coverKey: null,
      createdAt: '2026-07-16T06:00:00.000Z',
      updatedAt: '2026-07-16T06:00:00.000Z',
    };
    const updatedScene = { ...scene, name: '新场景名' };
    vi.mocked(projectApi.updateScene).mockResolvedValue(updatedScene);
    const store = useProjectStore();
    store.currentProject = {
      ...detail,
      sceneCount: 1,
      scenes: [scene],
    };

    await store.updateScene('scene-1', { name: '新场景名' });

    expect(projectApi.updateScene).toHaveBeenCalledWith('scene-1', {
      name: '新场景名',
    });
    expect(store.currentProject?.scenes[0]?.name).toBe('新场景名');
  });
});
