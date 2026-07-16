import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RuntimeCanvas from '../src/RuntimeCanvas.vue';

const fixtures = vi.hoisted(() => {
  const lifecycle: string[] = [];
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
      meshCount: 0,
      vertexCount: 0,
      faceCount: 0,
    })),
    dispose: vi.fn(() => lifecycle.push('engine:dispose')),
  };
  const runtime = {
    load: vi.fn(),
    start: vi.fn(() => lifecycle.push('runtime:start')),
    injectSocketMessage: vi.fn(async () => undefined),
    dispose: vi.fn(() => lifecycle.push('runtime:dispose')),
  };
  return { lifecycle, engine, runtime };
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
    constructor() {
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
    wrapper.unmount();
    expect(fixtures.lifecycle.slice(-2)).toEqual([
      'runtime:dispose',
      'engine:dispose',
    ]);
  });
});
