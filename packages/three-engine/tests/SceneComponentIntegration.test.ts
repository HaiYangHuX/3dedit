// @vitest-environment happy-dom

import {
  createDefaultChartComponent,
  createDefaultSceneDocument,
  createDefaultTextComponent,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { Group, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  SceneDocumentSystem,
  type AssetInstanceProvider,
  type EChartsAdapter,
  type EChartsInstanceLike,
} from '../src/index.js';
import { createSceneObject } from '../src/objects/createSceneObject.js';

function node(
  id: string,
  component: SceneNode['components'][number],
): SceneNode {
  return {
    id,
    parentId: null,
    childIds: [],
    name: id,
    enabled: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    components: [component],
    businessData: {},
  };
}

function canvas(): HTMLCanvasElement {
  return { width: 1_200, height: 400 } as HTMLCanvasElement;
}

function createECharts() {
  const instance: EChartsInstanceLike = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const api: EChartsAdapter = { init: vi.fn(() => instance) };
  return { api, instance };
}

function createAssets(): AssetInstanceProvider {
  return {
    beginGeneration: vi.fn(() => 1),
    instantiate: vi.fn(async () => new Group()),
    release: vi.fn(() => false),
    dispose: vi.fn(),
  };
}

describe('Scene chart/text integration', () => {
  it('共享对象工厂创建带稳定业务根和主组件元数据的文本与图表', async () => {
    const assets = createAssets();
    const { api } = createECharts();
    const textComponent = createDefaultTextComponent('CreatePlainTextCanvas');
    const text = node('text', textComponent);
    const chart = node('chart', createDefaultChartComponent('pie'));

    const textRoot = await createSceneObject(text, assets, 1, {
      text: { renderCanvas: canvas },
      chart: { echarts: api },
    });
    const chartRoot = await createSceneObject(chart, assets, 1, {
      text: { renderCanvas: canvas },
      chart: { echarts: api },
    });

    expect(textRoot.userData.primaryComponentKind).toBe('text');
    expect(textRoot.userData.textContent).toBe(textComponent.textContent);
    expect(textRoot.children).toHaveLength(1);
    expect(chartRoot.userData.primaryComponentKind).toBe('chart');
    expect(chartRoot.userData.chartType).toBe('pie');
    expect(chartRoot.children).toHaveLength(2);
  });

  it('文档系统增量更新真实组件、转发 DOM 事件并在删除时释放控制器', async () => {
    const assets = createAssets();
    const { api, instance } = createECharts();
    const system = new SceneDocumentSystem(new Scene(), assets, undefined, {
      createObject: (sceneNode, generation) =>
        createSceneObject(sceneNode, assets, generation, {
          text: { renderCanvas: canvas },
          chart: { echarts: api },
        }),
    });
    const document = createDefaultSceneDocument('project', 'scene', '场景');
    const text = node('text', createDefaultTextComponent('CreateTechCanvas'));
    const chart = node('chart', createDefaultChartComponent('line'));
    document.nodes = { text, chart };
    document.rootNodeIds = ['text', 'chart'];
    await system.loadDocument(document);

    const changedText = structuredClone(text);
    const textComponent = changedText.components[0]!;
    if (textComponent.kind === 'text') textComponent.textContent = '设备正常';
    await system.updateNode(changedText);
    expect(system.getObject('text')?.userData.textContent).toBe('设备正常');
    expect(system.setText('text', '设备告警')).toBe(true);
    expect(system.getObject('text')?.userData.textContent).toBe('设备告警');

    const option = { series: [{ type: 'bar', data: [1, 2, 3] }] };
    expect(system.setChartData('chart', option)).toBe(true);
    expect(instance.setOption).toHaveBeenLastCalledWith(option, {
      lazyUpdate: false,
      notMerge: true,
    });

    const onEnter = vi.fn();
    const unsubscribe = system.subscribeNodeEvent(
      'chart',
      'pointer-enter',
      onEnter,
    );
    const chartElement = documentQuery(system.getObject('chart'));
    chartElement.dispatchEvent(new PointerEvent('pointerenter'));
    expect(onEnter).toHaveBeenCalledOnce();
    unsubscribe?.();

    system.removeNodes(['chart']);
    expect(instance.dispose).toHaveBeenCalledOnce();
    system.dispose();
  });
});

function documentQuery(root: ReturnType<SceneDocumentSystem['getObject']>) {
  const element = root?.children.find((child) => 'element' in child) as
    (Group & { element: HTMLDivElement }) | undefined;
  if (!element) throw new Error('图表 DOM 未创建');
  return element.element;
}
