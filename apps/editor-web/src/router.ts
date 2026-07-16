import { createRouter, createWebHistory } from 'vue-router';
import AssetsView from './views/AssetsView.vue';
import EditorWorkspace from './views/EditorWorkspace.vue';
import ProjectsView from './views/ProjectsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', component: ProjectsView },
    { path: '/assets', component: AssetsView },
    {
      path: '/editor/:projectId/:sceneId',
      component: EditorWorkspace,
    },
  ],
});
