import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeHostAdapter } from '../src/index.js';

describe('RuntimeHostAdapter', () => {
  it('颜色动作克隆共享材质且显隐、变换、高亮和聚焦均按节点执行', async () => {
    const sharedGeometry = new BoxGeometry();
    const sharedMaterial = new MeshStandardMaterial({ color: '#ffffff' });
    const firstMesh = new Mesh(sharedGeometry, sharedMaterial);
    const secondMesh = new Mesh(sharedGeometry, sharedMaterial);
    const first = new Group();
    const second = new Group();
    first.add(firstMesh);
    second.add(secondMesh);
    const objects = new Map([
      ['first', first],
      ['second', second],
    ]);
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    const controls = {
      target: new Vector3(),
      update: vi.fn(),
    };
    const outline = { selectedObjects: [] as Group[] };
    const adapter = new RuntimeHostAdapter({
      getObject: (nodeId) => objects.get(nodeId),
      camera,
      controls,
      outline,
      subscribeNodeEvent: () => () => undefined,
    });

    await adapter.setColor('first', '#ff0000');
    const firstMaterial = firstMesh.material as MeshStandardMaterial;
    expect(firstMaterial).not.toBe(sharedMaterial);
    expect(firstMaterial.color.getHexString()).toBe('ff0000');
    expect(secondMesh.material).toBe(sharedMaterial);
    expect(sharedMaterial.color.getHexString()).toBe('ffffff');

    await adapter.setVisibility('first', false);
    await adapter.setTransform('first', { position: [2, 3, 4] });
    await adapter.setHighlight('first', true);
    await adapter.focusNode('first');
    expect(first.visible).toBe(false);
    expect(first.position.toArray()).toEqual([2, 3, 4]);
    expect(outline.selectedObjects).toEqual([first]);
    expect(controls.target.toArray()).toEqual([2, 3, 4]);

    const dispose = vi.spyOn(firstMaterial, 'dispose');
    adapter.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(firstMesh.material).toBe(sharedMaterial);
    expect(outline.selectedObjects).toEqual([]);
  });

  it('文本、图表、视频和动画无具体组件系统时保留可消费的运行状态', async () => {
    const object = new Group();
    const adapter = new RuntimeHostAdapter({
      getObject: () => object,
      camera: new PerspectiveCamera(),
      outline: { selectedObjects: [] },
      subscribeNodeEvent: () => () => undefined,
    });

    await adapter.setText('node', '运行文本');
    await adapter.setChartData('node', { value: 42 });
    await adapter.controlVideo('node', { command: 'play' });
    await adapter.controlAnimation('node', { command: 'pause' });

    expect(object.userData.runtimeState).toMatchObject({
      text: '运行文本',
      chartData: { value: 42 },
      video: { command: 'play' },
      animation: { command: 'pause' },
    });
    adapter.dispose();
  });
});
