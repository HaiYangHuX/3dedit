import type {
  ProjectDetail,
  ProjectSummary,
  SceneDetail,
  SceneSummary,
  UpdateProjectInput,
} from '@digital-twin/api-contracts';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiError } from '../api/client';
import { projectApi } from '../api/projects';

function toProjectSummary(project: ProjectDetail): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    coverKey: project.coverKey,
    sceneCount: project.sceneCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function toSceneSummary(scene: SceneDetail): SceneSummary {
  return {
    id: scene.id,
    projectId: scene.projectId,
    name: scene.name,
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
      projects.value = await projectApi.list(keyword);
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

  async function createProject(
    name: string,
    description: string,
  ): Promise<ProjectDetail> {
    return perform(async () => {
      const project = await projectApi.createProject({ name, description });
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

  async function copyProject(id: string): Promise<ProjectDetail> {
    return perform(async () => {
      const project = await projectApi.copyProject(id, {});
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

  async function createScene(projectId: string, name: string): Promise<void> {
    await perform(async () => {
      const scene = await projectApi.createScene(projectId, { name });
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
    deleteScene,
  };
});
