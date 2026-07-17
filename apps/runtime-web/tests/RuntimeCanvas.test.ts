import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RuntimeCanvas from '../src/RuntimeCanvas.vue';

const fixtures = vi.hoisted(() => {
  const lifecycle: string[] = [];
  let visibleMeshCount = 0;
  let runtimeOptions: { onInteractionSettled?: () => void } = {};
  let navigationListener:
    | ((state: {
        mode: 'orbit' | 'first-person' | 'roaming';
        paths: Array<{
          id: string;
          name: string;
          pathPoints: Array<[number, number, number]>;
        }>;
        activePathId: string | null;
      }) => void)
    | undefined;
  const navigationState = {
    mode: 'orbit' as 'orbit' | 'first-person' | 'roaming',
    paths: [
      {
        id: 'path-1',
        name: '漫游路径 1',
        pathPoints: [
          [0, 0.55, 0],
          [4, 0.55, 4],
        ] as Array<[number, number, number]>,
      },
    ],
    activePathId: null as string | null,
  };
  const engine = {
    initialize: vi.fn(async () => lifecycle.push('engine:initialize')),
    loadDocument: vi.fn(async () => ({
      loadedNodeIds: [],
      placeholderNodeIds: [],
      errors: [],
    })),
    createHost: vi.fn(() => ({})),
    getStats: vi.fn(() => ({
      objectCount: 0,
      meshCount: visibleMeshCount,
      vertexCount: 0,
      faceCount: 0,
    })),
    subscribeNavigation: vi.fn((listener: typeof navigationListener) => {
      navigationListener = listener;
      listener?.(structuredClone(navigationState));
      return vi.fn();
    }),
    resetCamera: vi.fn(),
    requestFirstPerson: vi.fn(() => true),
    exitFirstPerson: vi.fn(),
    playCameraRoaming: vi.fn(() => true),
    stopCameraRoaming: vi.fn(),
    dispose: vi.fn(() => lifecycle.push('engine:dispose')),
  };
  const runtime = {
    load: vi.fn(),
    start: vi.fn(() => lifecycle.push('runtime:start')),
    injectSocketMessage: vi.fn(async () => undefined),
    dispose: vi.fn(() => lifecycle.push('runtime:dispose')),
  };
  return {
    lifecycle,
    engine,
    runtime,
    setVisibleMeshCount(value: number) {
      visibleMeshCount = value;
    },
    setRuntimeOptions(value: { onInteractionSettled?: () => void }) {
      runtimeOptions = value;
    },
    notifyInteractionSettled() {
      runtimeOptions.onInteractionSettled?.();
    },
    setNavigation(
      patch: Partial<{
        mode: 'orbit' | 'first-person' | 'roaming';
        activePathId: string | null;
      }>,
    ) {
      Object.assign(navigationState, patch);
      navigationListener?.(structuredClone(navigationState));
    },
  };
});

vi.mock('@digital-twin/three-engine', () => ({
  RuntimeThreeEngine: class {
    constructor() {
      return fixtures.engine;
    }
  },
}));

vi.mock('@digital-twin/runtime-core', () => ({
  SceneRuntime: class {
    constructor(options: { onInteractionSettled?: () => void }) {
      fixtures.setRuntimeOptions(options);
      return fixtures.runtime;
    }
  },
}));

describe('RuntimeCanvas', () => {
  beforeEach(() => {
    fixtures.lifecycle.length = 0;
    vi.clearAllMocks();
  });

  it('先加载 Three 文档再启动 SceneRuntime，并暴露运行时状态', async () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );
    const resolver = { resolve: vi.fn() };
    const wrapper = mount(RuntimeCanvas, {
      props: { document, resolver, mode: 'preview' },
    });
    await flushPromises();

    expect(fixtures.engine.loadDocument).toHaveBeenCalledWith(
      document,
      resolver,
    );
    expect(fixtures.runtime.load).toHaveBeenCalledWith(document);
    expect(fixtures.lifecycle).toEqual(['engine:initialize', 'runtime:start']);
    expect(wrapper.attributes('data-runtime-ready')).toBe('true');
    expect(wrapper.attributes('data-runtime-mode')).toBe('preview');
    expect(wrapper.attributes('data-navigation-mode')).toBe('orbit');
    expect(wrapper.attributes('data-visible-mesh-count')).toBe('0');

    fixtures.setVisibleMeshCount(1);
    fixtures.notifyInteractionSettled();
    await flushPromises();
    expect(wrapper.attributes('data-visible-mesh-count')).toBe('1');
    wrapper.unmount();
    expect(fixtures.lifecycle.slice(-2)).toEqual([
      'runtime:dispose',
      'engine:dispose',
    ]);
  });

  it('草稿预览显示完整相机工具栏并转发重置、第一人称和漫游控制', async () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );
    const wrapper = mount(RuntimeCanvas, {
      props: {
        document,
        resolver: { resolve: vi.fn() },
        mode: 'preview',
      },
      global: { stubs: { Teleport: true } },
    });
    await flushPromises();

    await wrapper.get('[aria-label="重置场景相机位置"]').trigger('click');
    await wrapper.get('[aria-label="进入第一人称视角"]').trigger('click');
    await wrapper.get('[aria-label="选择漫游路径"]').trigger('click');
    await wrapper.get('[aria-label="播放漫游路径 1"]').trigger('click');
    expect(fixtures.engine.resetCamera).toHaveBeenCalled();
    expect(fixtures.engine.requestFirstPerson).toHaveBeenCalled();
    expect(fixtures.engine.playCameraRoaming).toHaveBeenCalledWith('path-1');

    fixtures.setNavigation({ mode: 'roaming', activePathId: 'path-1' });
    await flushPromises();
    expect(wrapper.attributes('data-navigation-mode')).toBe('roaming');
    expect(wrapper.text()).toContain('漫游中..');
    await wrapper.get('[aria-label="取消相机漫游"]').trigger('click');
    expect(fixtures.engine.stopCameraRoaming).toHaveBeenCalled();
  });

  it('正式发布模式不显示编辑器式预览工具栏', async () => {
    const wrapper = mount(RuntimeCanvas, {
      props: {
        document: createDefaultSceneDocument('project', 'scene', '发布'),
        resolver: { resolve: vi.fn() },
        mode: 'runtime',
      },
    });
    await flushPromises();

    expect(
      wrapper.find('[data-testid="runtime-preview-toolbar"]').exists(),
    ).toBe(false);
  });
});
