import type { AssetDetail } from '@digital-twin/api-contracts';
import { flushPromises, mount } from '@vue/test-utils';
import type * as ThreeModule from 'three';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssetPreviewCanvas from '../src/components/AssetPreviewCanvas.vue';

const { alignObjectToGround, loadModel } = vi.hoisted(() => ({
  alignObjectToGround: vi.fn(),
  loadModel: vi.fn(),
}));

vi.mock('@digital-twin/three-engine', () => ({
  alignObjectToGround,
  AssetLoader: class {
    load = loadModel;
    dispose = vi.fn();
  },
}));

vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof ThreeModule>();
  return {
    ...original,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      outputColorSpace = '';
      toneMapping = 0;
      toneMappingExposure = 1;
      shadowMap = { enabled: false };
      setPixelRatio = vi.fn();
      setSize = vi.fn();
      render = vi.fn();
      dispose = vi.fn();
    },
  };
});

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = { set: vi.fn(), copy: vi.fn() };
    enableDamping = false;
    dampingFactor = 0;
    screenSpacePanning = false;
    minDistance = 0;
    maxDistance = 0;
    update = vi.fn();
    dispose = vi.fn();
  },
}));

const asset = {
  id: 'asset-1',
  name: 'AGV 接驳总装',
  kind: 'model',
  status: 'ready',
  format: 'glb',
  sourceHash: 'source-hash',
  files: [
    {
      role: 'source',
      checksum: 'source-hash',
      downloadUrl: 'https://assets.test/agv.glb',
    },
  ],
} as AssetDetail;

describe('AssetPreviewCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    alignObjectToGround.mockReset();
    loadModel.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('加载模型后先将包围盒最低点对齐到预览网格', async () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    mesh.position.y = 4;
    root.add(mesh);
    loadModel.mockResolvedValue({ root, animations: [] });

    const wrapper = mount(AssetPreviewCanvas, { props: { asset } });
    await flushPromises();

    expect(alignObjectToGround).toHaveBeenCalledOnce();
    expect(alignObjectToGround).toHaveBeenCalledWith(root, 0);
    wrapper.unmount();
  });
});
