import type {
  CopyProjectInput,
  CreateProjectInput,
  CreateSceneInput,
  ProjectDetail,
  ProjectSummary,
  SceneDetail,
  SceneSummary,
  UpdateProjectInput,
  UpdateSceneInput,
} from '@digital-twin/api-contracts';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiError } from '../api/client';
import { projectApi } from '../api/projects';

/**
 * 列表只保留卡片和编辑表单真正需要的字段；运营属性继续由 API 兼容旧数据，
 * 但不再进入前端项目管理状态，避免被误展示或在后续请求中回写。
 */
function toProjectSummary(
  project: ProjectSummary | ProjectDetail,
): ProjectSummary {
  const scenes = 'scenes' in project ? project.scenes : undefined;
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    code: project.code ?? '',
    coverKey: project.coverKey ?? null,
    sceneCount: project.sceneCount ?? scenes?.length ?? 0,
    assetCount: project.assetCount ?? 0,
    lastPublishedAt: project.lastPublishedAt ?? null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function toSceneSummary(scene: SceneDetail): SceneSummary {
  return {
    id: scene.id,
    projectId: scene.projectId,
    name: scene.name,
    description: scene.description ?? '',
    sortOrder: scene.sortOrder,
    revision: scene.revision,
    contentHash: scene.contentHash,
    coverKey: scene.coverKey,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  };
}

/** 管理项目列表和当前项目 DTO，不持有编辑器引擎或 Three.js 对象。 */
export const useProjectStore = defineStore('project', () => {
  const projects = ref<ProjectSummary[]>([]);
  const currentProject = ref<ProjectDetail | null>(null);
  const loading = ref(false);
  const error = ref('');

  async function perform<T>(operation: () => Promise<T>): Promise<T> {
    loading.value = true;
    error.value = '';
    try {
      return await operation();
    } catch (reason) {
      error.value =
        reason instanceof ApiError ? reason.message : '操作失败，请稍后重试';
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  function upsertProject(project: ProjectDetail): void {
    const summary = toProjectSummary(project);
    const index = projects.value.findIndex(({ id }) => id === project.id);
    if (index === -1) projects.value.unshift(summary);
    else projects.value[index] = summary;
  }

  async function loadProjects(keyword = ''): Promise<void> {
    await perform(async () => {
      projects.value = (await projectApi.list(keyword)).map(toProjectSummary);
    });
  }

  async function openProject(id: string): Promise<ProjectDetail> {
    return perform(async () => {
      const project = await projectApi.getProject(id);
      currentProject.value = project;
      upsertProject(project);
      return project;
    });
  }

  /** 支持传入完整表单对象，也兼容旧调用 createProject(name, description)。 */
  async function createProject(
    input: CreateProjectInput | string,
    description = '',
  ): Promise<ProjectDetail> {
    const payload: CreateProjectInput =
      typeof input === 'string' ? { name: input, description } : input;
    return perform(async () => {
      const project = await projectApi.createProject(payload);
      currentProject.value = project;
      upsertProject(project);
      return project;
    });
  }

  async function updateProject(
    id: string,
    input: UpdateProjectInput,
  ): Promise<ProjectDetail> {
    return perform(async () => {
      const project = await projectApi.updateProject(id, input);
      currentProject.value = project;
      upsertProject(project);
      return project;
    });
  }

  async function copyProject(
    id: string,
    input: CopyProjectInput = {},
  ): Promise<ProjectDetail> {
    return perform(async () => {
      const project = await projectApi.copyProject(id, input);
      currentProject.value = project;
      upsertProject(project);
      return project;
    });
  }

  async function deleteProject(id: string): Promise<void> {
    await perform(async () => {
      await projectApi.deleteProject(id);
      projects.value = projects.value.filter((project) => project.id !== id);
      if (currentProject.value?.id === id) currentProject.value = null;
    });
  }

  /** 创建场景支持完整表单对象，同时兼容旧调用方只传名称的方式。 */
  async function createScene(
    projectId: string,
    input: CreateSceneInput | string,
  ): Promise<void> {
    await perform(async () => {
      const payload: CreateSceneInput =
        typeof input === 'string' ? { name: input } : input;
      const scene = await projectApi.createScene(projectId, payload);
      if (!currentProject.value || currentProject.value.id !== projectId)
        return;
      currentProject.value.scenes.push(toSceneSummary(scene));
      currentProject.value.sceneCount = currentProject.value.scenes.length;
      upsertProject(currentProject.value);
    });
  }

  async function copyScene(id: string): Promise<void> {
    await perform(async () => {
      const scene = await projectApi.copyScene(id, {});
      if (!currentProject.value) return;
      currentProject.value.scenes.push(toSceneSummary(scene));
      currentProject.value.sceneCount = currentProject.value.scenes.length;
      upsertProject(currentProject.value);
    });
  }

  /** 更新场景元数据后同步当前项目，避免返回列表仍显示旧名称。 */
  async function updateScene(
    id: string,
    input: UpdateSceneInput,
  ): Promise<SceneDetail> {
    return perform(async () => {
      const scene = await projectApi.updateScene(id, input);
      if (!currentProject.value) return scene;
      const index = currentProject.value.scenes.findIndex(
        (item) => item.id === id,
      );
      if (index !== -1) {
        currentProject.value.scenes[index] = toSceneSummary(scene);
        upsertProject(currentProject.value);
      }
      return scene;
    });
  }

  async function deleteScene(id: string): Promise<void> {
    await perform(async () => {
      await projectApi.deleteScene(id);
      if (!currentProject.value) return;
      currentProject.value.scenes = currentProject.value.scenes.filter(
        (scene) => scene.id !== id,
      );
      currentProject.value.sceneCount = currentProject.value.scenes.length;
      upsertProject(currentProject.value);
    });
  }

  return {
    projects,
    currentProject,
    loading,
    error,
    loadProjects,
    openProject,
    createProject,
    updateProject,
    copyProject,
    deleteProject,
    createScene,
    copyScene,
    updateScene,
    deleteScene,
  };
});
