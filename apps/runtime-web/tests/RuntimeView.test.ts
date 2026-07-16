import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { flushPromises, mount } from '@vue/test-utils';
import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw,
} from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RuntimeView from '../src/views/RuntimeView.vue';

const api = vi.hoisted(() => ({
  getPreviewScene: vi.fn(),
  getPublicationManifest: vi.fn(),
}));

vi.mock('../src/api/runtime.js', () => ({ runtimeApi: api }));

const routes: RouteRecordRaw[] = [
  { path: '/preview/:sceneId', name: 'preview', component: RuntimeView },
  {
    path: '/runtime/:publicationId',
    name: 'runtime',
    component: RuntimeView,
  },
];

describe('RuntimeView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preview 路由只读取当前 SceneDocument', async () => {
    const document = createDefaultSceneDocument('project', 'scene-1', '草稿');
    api.getPreviewScene.mockResolvedValue({ document });
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push('/preview/scene-1');
    await router.isReady();

    const wrapper = mount(RuntimeView, {
      global: {
        plugins: [router],
        stubs: {
          RuntimeCanvas: {
            props: ['document', 'resolver', 'mode'],
            template: '<div data-testid="loaded-runtime">{{ mode }}</div>',
          },
        },
      },
    });
    await flushPromises();

    expect(api.getPreviewScene).toHaveBeenCalledWith('scene-1');
    expect(api.getPublicationManifest).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="loaded-runtime"]').text()).toBe(
      'preview',
    );
  });

  it('runtime 路由只读取发布 Manifest', async () => {
    const document = createDefaultSceneDocument('project', 'scene-1', '发布');
    api.getPublicationManifest.mockResolvedValue({
      schemaVersion: 1,
      publicationId: 'publication-1',
      projectId: 'project',
      sceneId: 'scene-1',
      contentHash: 'hash',
      document,
      assets: {},
    });
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push('/runtime/publication-1');
    await router.isReady();

    mount(RuntimeView, {
      global: {
        plugins: [router],
        stubs: { RuntimeCanvas: true },
      },
    });
    await flushPromises();

    expect(api.getPublicationManifest).toHaveBeenCalledWith('publication-1');
    expect(api.getPreviewScene).not.toHaveBeenCalled();
  });
});
