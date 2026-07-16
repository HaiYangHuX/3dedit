import type {
  ProjectDetail,
  ProjectSummary,
} from '@digital-twin/api-contracts';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectApi } from '../src/api/projects';
import { useProjectStore } from '../src/stores/project';

vi.mock('../src/api/projects', () => ({
  projectApi: {
    list: vi.fn(),
    createProject: vi.fn(),
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
    expect(store.projects).toEqual([summary]);
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
});
