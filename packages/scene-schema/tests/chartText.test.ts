import { describe, expect, it } from 'vitest';
import {
  CHART_TYPES,
  TEXT_METHODS,
  chartComponentSchema,
  createDefaultChartComponent,
  createDefaultTextComponent,
  sceneNodeSchema,
  textComponentSchema,
} from '../src/index';

const baseNode = {
  id: 'component-1',
  parentId: null,
  childIds: [],
  name: '场景组件',
  enabled: true,
  locked: false,
  transform: {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  },
  businessData: {},
};

describe('图表与文本场景协议', () => {
  it('声明完整的文本模板和图表模板集合', () => {
    expect(TEXT_METHODS).toEqual([
      'CreatePlainTextCanvas',
      'CreateFixedCanvas',
      'CreateMotionCanvas',
      'CreateMusicCanvas',
      'CreateTechCanvas',
      'CreateFashionCanvas',
      'CreateWesternCanvas',
      'CreateCampusCanvas',
      'CreateDigitalTwin',
      'CreateIotSensing',
      'CreateHologramPanel',
      'CreateCyberHud',
    ]);
    expect(CHART_TYPES).toEqual([
      'pie',
      'line',
      'funnel',
      'stacked-line',
      'stacked-bar',
      'radar',
      'scatter',
      'gauge',
      'heatmap',
    ]);
  });

  it('创建可序列化且带完整默认值的文本组件', () => {
    const plain = createDefaultTextComponent('CreatePlainTextCanvas');
    const iot = createDefaultTextComponent('CreateIotSensing');

    expect(textComponentSchema.parse(plain)).toEqual(plain);
    expect(plain).toEqual({
      kind: 'text',
      textMethod: 'CreatePlainTextCanvas',
      textType: 'Sprite',
      color: '#ffffff',
      fontSize: 16,
      textContent: '数字孪生场景编辑器',
    });
    expect(iot).toMatchObject({
      textMethod: 'CreateIotSensing',
      fontSize: 15,
      textContent: '温度传感器: 24.5℃ | 湿度: 45%',
    });
  });

  it('创建九种 JSON 可序列化图表默认配置', () => {
    for (const chartType of CHART_TYPES) {
      const component = createDefaultChartComponent(chartType);
      expect(chartComponentSchema.parse(component)).toEqual(component);
      expect(component.width).toBe(850);
      expect(component.height).toBe(500);
      expect(JSON.parse(JSON.stringify(component.option))).toEqual(
        component.option,
      );
      expect(component.option.series).toBeDefined();
    }
  });

  it('拒绝旧占位结构和超出范围的文本、图表配置', () => {
    expect(
      sceneNodeSchema.safeParse({
        ...baseNode,
        components: [{ kind: 'text', data: { textContent: '旧结构' } }],
      }).success,
    ).toBe(false);
    expect(
      textComponentSchema.safeParse({
        ...createDefaultTextComponent('CreateFixedCanvas'),
        fontSize: 25,
      }).success,
    ).toBe(false);
    expect(
      chartComponentSchema.safeParse({
        ...createDefaultChartComponent('pie'),
        option: [],
      }).success,
    ).toBe(false);
  });
});
