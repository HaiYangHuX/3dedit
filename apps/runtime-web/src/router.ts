import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/preview/local-scene' },
    {
      path: '/preview/:sceneId',
      name: 'preview',
      component: () => import('./views/RuntimeView.vue'),
    },
    {
      path: '/runtime/:publicationId',
      name: 'runtime',
      component: () => import('./views/RuntimeView.vue'),
    },
  ],
});
