import { createRouter, createWebHistory } from 'vue-router';
import AssetsView from './views/AssetsView.vue';
import EditorWorkspace from './views/EditorWorkspace.vue';
import ProjectDetailView from './views/ProjectDetailView.vue';
import ProjectsView from './views/ProjectsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', component: ProjectsView },
    {
      path: '/projects/:projectId',
      component: ProjectDetailView,
      props: true,
    },
    { path: '/assets', component: AssetsView },
    {
      path: '/editor/:projectId/:sceneId',
      component: EditorWorkspace,
    },
  ],
});
