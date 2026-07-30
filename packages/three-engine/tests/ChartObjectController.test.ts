// @vitest-environment happy-dom

import { createDefaultChartComponent } from '@digital-twin/scene-schema';
import { Box3, Mesh, type MeshBasicMaterial } from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { describe, expect, it, vi } from 'vitest';
import {
  createChartObject,
  disposeSceneComponentObject,
  setChartObjectOption,
  subscribeChartObjectEvent,
  updateChartObject,
  type EChartsAdapter,
  type EChartsInstanceLike,
} from '../src/index.js';

function createECharts() {
  const instance: EChartsInstanceLike = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const api: EChartsAdapter = {
    init: vi.fn(() => instance),
  };
  return { api, instance };
}

describe('ChartObjectController', () => {
  it('创建 ECharts CSS3D 内容和与世界尺寸一致的不可见拾取盒', () => {
    const component = createDefaultChartComponent('pie');
    const { api, instance } = createECharts();

    const root = createChartObject(component, 'chart-1', { echarts: api });
    const picker = root.children.find((child) => child instanceof Mesh) as Mesh;
    const cssObject = root.children.find(
      (child) => child instanceof CSS3DObject,
    ) as CSS3DObject;
    const chartElement = cssObject.element.querySelector<HTMLElement>(
      '[data-chart-canvas]',
    );

    expect(picker).toBeInstanceOf(Mesh);
    expect((picker.material as MeshBasicMaterial).visible).toBe(false);
    const bounds = new Box3().setFromObject(picker);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(3.4);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(2);
    expect(cssObject.position.y).toBe(1.5);
    expect(cssObject.scale.toArray()).toEqual([0.004, 0.004, 0.004]);
    expect(chartElement?.style.width).toBe('850px');
    expect(chartElement?.style.height).toBe('500px');
    expect(chartElement?.style.pointerEvents).toBe('auto');
    expect(api.init).toHaveBeenCalledWith(chartElement, undefined, {
      renderer: 'canvas',
      width: 850,
      height: 500,
    });
    expect(instance.setOption).toHaveBeenCalledWith(component.option, {
      lazyUpdate: false,
      notMerge: true,
    });
    expect(root.userData.chartType).toBe('pie');
  });

  it('更新配置和尺寸时复用 ECharts 实例', () => {
    const component = createDefaultChartComponent('line');
    const { api, instance } = createECharts();
    const root = createChartObject(component, 'chart-1', { echarts: api });
    vi.mocked(instance.setOption).mockClear();

    const next = {
      ...component,
      width: 640,
      height: 360,
      option: { series: [{ type: 'bar', data: [1, 2, 3] }] },
    };
    expect(updateChartObject(root, next)).toBe(true);

    expect(api.init).toHaveBeenCalledTimes(1);
    expect(instance.resize).toHaveBeenCalledWith({ width: 640, height: 360 });
    expect(instance.setOption).toHaveBeenCalledWith(next.option, {
      lazyUpdate: false,
      notMerge: true,
    });
    expect(root.userData.chartType).toBe('line');
  });

  it('运行时 option 更新与 DOM 事件订阅作用于真实图表', () => {
    const component = createDefaultChartComponent('gauge');
    const { api, instance } = createECharts();
    const root = createChartObject(component, 'chart-1', { echarts: api });
    const onEnter = vi.fn();
    const unsubscribe = subscribeChartObjectEvent(
      root,
      'pointer-enter',
      onEnter,
    );
    const element = root.children.find(
      (child) => child instanceof CSS3DObject,
    )!.element;

    element.dispatchEvent(new PointerEvent('pointerenter'));
    expect(onEnter).toHaveBeenCalledOnce();
    unsubscribe?.();
    element.dispatchEvent(new PointerEvent('pointerenter'));
    expect(onEnter).toHaveBeenCalledOnce();

    const option = { series: [{ data: [{ value: 88 }] }] };
    expect(setChartObjectOption(root, option)).toBe(true);
    expect(instance.setOption).toHaveBeenLastCalledWith(option, {
      lazyUpdate: false,
      notMerge: true,
    });
  });

  it('释放控制器时销毁 ECharts、DOM 和事件且保持幂等', () => {
    const { api, instance } = createECharts();
    const root = createChartObject(
      createDefaultChartComponent('heatmap'),
      'chart-1',
      { echarts: api },
    );
    const cssObject = root.children.find(
      (child) => child instanceof CSS3DObject,
    ) as CSS3DObject;
    document.body.append(cssObject.element);

    expect(disposeSceneComponentObject(root)).toBe(true);
    expect(disposeSceneComponentObject(root)).toBe(false);
    expect(instance.dispose).toHaveBeenCalledOnce();
    expect(cssObject.element.isConnected).toBe(false);
  });
});
