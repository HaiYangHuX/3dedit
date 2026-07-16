import type {
  CopyProjectInput,
  CopySceneInput,
  CreateProjectInput,
  CreateSceneInput,
  ProjectDetail,
  ProjectSummary,
  ReorderScenesInput,
  SaveSceneInput,
  SceneDetail,
  SceneSummary,
  UpdateProjectInput,
  UpdateSceneInput,
} from '@digital-twin/api-contracts';
import { apiRequest } from './client';

const idPath = (id: string) => encodeURIComponent(id);

/** 项目与场景 REST 路由的薄封装，响应类型全部来自共享契约。 */
export const projectApi = {
  list(keyword = ''): Promise<ProjectSummary[]> {
    const query = new URLSearchParams({ keyword });
    return apiRequest(`/projects?${query.toString()}`);
  },
  getProject(id: string): Promise<ProjectDetail> {
    return apiRequest(`/projects/${idPath(id)}`);
  },
  createProject(input: CreateProjectInput): Promise<ProjectDetail> {
    return apiRequest('/projects', { method: 'POST', body: input });
  },
  updateProject(id: string, input: UpdateProjectInput): Promise<ProjectDetail> {
    return apiRequest(`/projects/${idPath(id)}`, {
      method: 'PATCH',
      body: input,
    });
  },
  copyProject(id: string, input: CopyProjectInput): Promise<ProjectDetail> {
    return apiRequest(`/projects/${idPath(id)}/copy`, {
      method: 'POST',
      body: input,
    });
  },
  deleteProject(id: string): Promise<void> {
    return apiRequest(`/projects/${idPath(id)}`, { method: 'DELETE' });
  },
  getScene(id: string): Promise<SceneDetail> {
    return apiRequest(`/scenes/${idPath(id)}`);
  },
  createScene(
    projectId: string,
    input: CreateSceneInput,
  ): Promise<SceneDetail> {
    return apiRequest(`/projects/${idPath(projectId)}/scenes`, {
      method: 'POST',
      body: input,
    });
  },
  updateScene(id: string, input: UpdateSceneInput): Promise<SceneDetail> {
    return apiRequest(`/scenes/${idPath(id)}`, {
      method: 'PATCH',
      body: input,
    });
  },
  copyScene(id: string, input: CopySceneInput): Promise<SceneDetail> {
    return apiRequest(`/scenes/${idPath(id)}/copy`, {
      method: 'POST',
      body: input,
    });
  },
  deleteScene(id: string): Promise<void> {
    return apiRequest(`/scenes/${idPath(id)}`, { method: 'DELETE' });
  },
  reorderScenes(
    projectId: string,
    input: ReorderScenesInput,
  ): Promise<SceneSummary[]> {
    return apiRequest(`/projects/${idPath(projectId)}/scenes/order`, {
      method: 'PUT',
      body: input,
    });
  },
  saveScene(id: string, input: SaveSceneInput): Promise<SceneDetail> {
    return apiRequest(`/scenes/${idPath(id)}/document`, {
      method: 'PUT',
      body: input,
    });
  },
};
