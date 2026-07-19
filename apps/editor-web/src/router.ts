import { createRouter, createWebHistory } from 'vue-router';
import AssetsView from './views/AssetsView.vue';
import EditorWorkspace from './views/EditorWorkspace.vue';
import ManagementLayout from './layouts/ManagementLayout.vue';
import ProjectDetailView from './views/ProjectDetailView.vue';
import ProjectsView from './views/ProjectsView.vue';

/**
 * 管理页面共用后台壳层；编辑器和运行时预览保持独立全屏路由，避免布局
 * 的滚动容器、主题色或快捷键事件污染 Three.js 画布。
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: ManagementLayout,
      children: [
        { path: '', redirect: '/projects' },
        { path: 'projects', component: ProjectsView },
        {
          path: 'projects/:projectId',
          component: ProjectDetailView,
          props: true,
        },
        { path: 'assets', component: AssetsView },
      ],
    },
    {
      path: '/editor/:projectId/:sceneId',
      component: EditorWorkspace,
      props: true,
    },
  ],
});
