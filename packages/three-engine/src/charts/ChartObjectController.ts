import type { ChartComponent } from '@digital-twin/scene-schema';
import type { RuntimeNodeEvent } from '@digital-twin/runtime-core';
import {
  BarChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
} from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const CSS_WORLD_SCALE = 0.004;
const CHART_CENTER_Y = 1.5;

// ECharts 模块化入口既适配项目的 ESM 类型检查，也避免把未使用的图表实现打入前端。
echarts.use([
  BarChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export interface EChartsInstanceLike {
  setOption(
    option: ChartComponent['option'],
    settings: { lazyUpdate: boolean; notMerge: boolean },
  ): void;
  resize(size: { width: number; height: number }): void;
  dispose(): void;
}

export interface EChartsAdapter {
  init(
    element: HTMLElement,
    theme: string | object | null | undefined,
    options: { renderer: 'canvas'; width: number; height: number },
  ): EChartsInstanceLike;
}

export interface CreateChartObjectOptions {
  echarts?: EChartsAdapter;
}

interface ChartObjectController {
  component: ChartComponent;
  instance: EChartsInstanceLike;
  element: HTMLDivElement;
  chartElement: HTMLDivElement;
  cssObject: CSS3DObject;
  picker: Mesh<BoxGeometry, MeshBasicMaterial>;
  listeners: Map<RuntimeNodeEvent, Set<() => void>>;
  pointerStart?: { x: number; y: number };
  disposed: boolean;
  handlers: {
    pointerDown: (event: PointerEvent) => void;
    pointerUp: (event: PointerEvent) => void;
    pointerEnter: () => void;
    pointerLeave: () => void;
    doubleClick: () => void;
  };
}

const controllers = new WeakMap<Object3D, ChartObjectController>();

const browserECharts: EChartsAdapter = {
  init(element, theme, options) {
    return echarts.init(element, theme, options) as EChartsInstanceLike;
  },
};

function isOption(value: unknown): value is ChartComponent['option'] {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyOption(
  instance: EChartsInstanceLike,
  option: ChartComponent['option'],
): void {
  instance.setOption(option, { lazyUpdate: false, notMerge: true });
}

function createPicker(component: ChartComponent) {
  const geometry = new BoxGeometry(
    component.width * CSS_WORLD_SCALE,
    component.height * CSS_WORLD_SCALE,
    0.02,
  );
  const material = new MeshBasicMaterial({
    color: '#00ff00',
    wireframe: true,
    visible: false,
  });
  const picker = new Mesh(geometry, material);
  picker.position.y = CHART_CENTER_Y;
  picker.userData.chartPicker = true;
  return picker;
}

function writeMetadata(root: Group, component: ChartComponent): void {
  root.userData.isChartObject = true;
  root.userData.chartType = component.chartType;
  root.userData.chartWidth = component.width;
  root.userData.chartHeight = component.height;
}

function dispatch(
  controller: ChartObjectController,
  event: RuntimeNodeEvent,
): void {
  for (const listener of controller.listeners.get(event) ?? []) listener();
}

function createHandlers(
  read: () => ChartObjectController,
): ChartObjectController['handlers'] {
  return {
    pointerDown(event) {
      if (event.button !== 0) return;
      read().pointerStart = { x: event.clientX, y: event.clientY };
    },
    pointerUp(event) {
      const controller = read();
      const start = controller.pointerStart;
      controller.pointerStart = undefined;
      if (!start || event.button !== 0) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
        return;
      }
      dispatch(controller, 'click');
    },
    pointerEnter() {
      dispatch(read(), 'pointer-enter');
    },
    pointerLeave() {
      const controller = read();
      controller.pointerStart = undefined;
      dispatch(controller, 'pointer-leave');
    },
    doubleClick() {
      dispatch(read(), 'double-click');
    },
  };
}

function bindEvents(controller: ChartObjectController): void {
  const { element, handlers } = controller;
  element.addEventListener('pointerdown', handlers.pointerDown);
  element.addEventListener('pointerup', handlers.pointerUp);
  element.addEventListener('pointerenter', handlers.pointerEnter);
  element.addEventListener('pointerleave', handlers.pointerLeave);
  element.addEventListener('dblclick', handlers.doubleClick);
}

function unbindEvents(controller: ChartObjectController): void {
  const { element, handlers } = controller;
  element.removeEventListener('pointerdown', handlers.pointerDown);
  element.removeEventListener('pointerup', handlers.pointerUp);
  element.removeEventListener('pointerenter', handlers.pointerEnter);
  element.removeEventListener('pointerleave', handlers.pointerLeave);
  element.removeEventListener('dblclick', handlers.doubleClick);
}

export function createChartObject(
  component: ChartComponent,
  nodeId: string,
  options: CreateChartObjectOptions = {},
): Group {
  const root = new Group();
  const element = document.createElement('div');
  element.dataset.sceneNodeId = nodeId;
  element.className = 'scene-chart-object';
  element.style.pointerEvents = 'auto';

  const chartElement = document.createElement('div');
  chartElement.dataset.chartCanvas = '';
  chartElement.style.width = `${component.width}px`;
  chartElement.style.height = `${component.height}px`;
  chartElement.style.pointerEvents = 'auto';
  chartElement.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
  chartElement.style.borderRadius = '4px';
  chartElement.style.overflow = 'hidden';
  element.append(chartElement);

  const cssObject = new CSS3DObject(element);
  cssObject.position.y = CHART_CENTER_Y;
  cssObject.scale.setScalar(CSS_WORLD_SCALE);
  cssObject.userData.chartCssObject = true;
  const picker = createPicker(component);
  root.add(picker, cssObject);

  const instance = (options.echarts ?? browserECharts).init(
    chartElement,
    undefined,
    {
      renderer: 'canvas',
      width: component.width,
      height: component.height,
    },
  );
  applyOption(instance, component.option);

  const controller: ChartObjectController = {
    component: structuredClone(component),
    instance,
    element,
    chartElement,
    cssObject,
    picker,
    listeners: new Map(),
    disposed: false,
    // 事件真正触发时 controller 已完成初始化，闭包可稳定读取同一控制器实例。
    handlers: createHandlers(() => controller),
  };
  bindEvents(controller);
  controllers.set(root, controller);
  writeMetadata(root, component);
  return root;
}

export function updateChartObject(
  root: Object3D,
  component: ChartComponent,
): boolean {
  const controller = controllers.get(root);
  if (!controller || controller.disposed) return false;
  const sizeChanged =
    controller.component.width !== component.width ||
    controller.component.height !== component.height;
  if (sizeChanged) {
    controller.chartElement.style.width = `${component.width}px`;
    controller.chartElement.style.height = `${component.height}px`;
    controller.instance.resize({
      width: component.width,
      height: component.height,
    });
    const previous = controller.picker.geometry;
    controller.picker.geometry = new BoxGeometry(
      component.width * CSS_WORLD_SCALE,
      component.height * CSS_WORLD_SCALE,
      0.02,
    );
    previous.dispose();
  }
  applyOption(controller.instance, component.option);
  controller.component = structuredClone(component);
  writeMetadata(root as Group, component);
  return true;
}

export function setChartObjectOption(root: Object3D, option: unknown): boolean {
  const controller = controllers.get(root);
  if (!controller || controller.disposed || !isOption(option)) return false;
  return updateChartObject(root, {
    ...controller.component,
    option: structuredClone(option),
  });
}

export function subscribeChartObjectEvent(
  root: Object3D,
  event: RuntimeNodeEvent,
  listener: () => void,
): (() => void) | undefined {
  const controller = controllers.get(root);
  if (!controller || controller.disposed) return undefined;
  const listeners = controller.listeners.get(event) ?? new Set();
  listeners.add(listener);
  controller.listeners.set(event, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) controller.listeners.delete(event);
  };
}

export function releaseChartObjectController(root: Object3D): boolean {
  const controller = controllers.get(root);
  if (!controller || controller.disposed) return false;
  controller.disposed = true;
  unbindEvents(controller);
  controller.listeners.clear();
  controller.instance.dispose();
  controller.element.remove();
  controllers.delete(root);
  return true;
}
