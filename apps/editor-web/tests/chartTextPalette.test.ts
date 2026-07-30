import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NodeInspector from '../src/components/editor/NodeInspector.vue';
import {
  CHART_PALETTE_ITEMS,
  getChartDefinition,
} from '../src/editor/chartPalette';
import { createChartNode, createTextNode } from '../src/editor/createSceneNode';
import {
  getTextDefinition,
  TEXT_PALETTE_ITEMS,
} from '../src/editor/textPalette';

describe('chart/text palette', () => {
  it('提供 9 种图表和 12 种文本模板并创建强类型节点', () => {
    expect(CHART_PALETTE_ITEMS).toHaveLength(9);
    expect(TEXT_PALETTE_ITEMS).toHaveLength(12);
    expect(getChartDefinition('gauge').name).toBe('仪表盘');
    expect(getTextDefinition('CreateCyberHud').name).toBe('赛博 HUD');

    expect(createChartNode('pie', [1, 2, 3])).toMatchObject({
      name: '饼图',
      transform: { position: [1, 2, 3] },
      components: [{ kind: 'chart', chartType: 'pie' }],
    });
    expect(createTextNode('CreateTechCanvas', [4, 5, 6])).toMatchObject({
      name: '科技文本',
      transform: { position: [4, 5, 6] },
      components: [
        { kind: 'text', textMethod: 'CreateTechCanvas', textType: 'Sprite' },
      ],
    });
  });

  it('文本属性通过组件补丁提交显示类型、颜色、字号和内容', async () => {
    const node = createTextNode('CreateTechCanvas');
    const wrapper = mount(NodeInspector, { props: { node } });

    await wrapper.get('[data-testid="text-type-mesh"] input').setValue(true);
    await wrapper.get('[data-testid="text-font-size"] input').setValue('22');
    await wrapper
      .get('textarea[data-testid="text-content"]')
      .setValue('设备告警');
    await wrapper.get('textarea[data-testid="text-content"]').trigger('change');

    const updates = wrapper.emitted('update') ?? [];
    expect(
      updates.some(([patch]) => JSON.stringify(patch).includes('Mesh')),
    ).toBe(true);
    expect(
      updates.some(([patch]) => JSON.stringify(patch).includes('设备告警')),
    ).toBe(true);
  });

  it('文本输入失焦时立即提交，避免后续属性命令覆盖草稿', async () => {
    const node = createTextNode('CreateCyberHud');
    const wrapper = mount(NodeInspector, { props: { node } });
    const editor = wrapper.get('textarea[data-testid="text-content"]');

    await editor.setValue('产线 A-07 · 运行正常');
    await editor.trigger('blur');
    await wrapper.get('[data-testid="text-type-mesh"] input').setValue(true);

    const updates = wrapper.emitted('update') ?? [];
    const latestPatch = updates.at(-1)?.[0];
    expect(JSON.stringify(latestPatch)).toContain('Mesh');
    expect(JSON.stringify(latestPatch)).toContain('产线 A-07 · 运行正常');
  });

  it('图表 JSON 校验成功后提交完整 option，非法对象显示错误', async () => {
    const node = createChartNode('line');
    const wrapper = mount(NodeInspector, { props: { node } });
    const editor = wrapper.get('textarea[data-testid="chart-option"]');

    await editor.setValue('[]');
    await wrapper.get('[data-testid="update-chart-option"]').trigger('click');
    expect(wrapper.get('[data-testid="chart-option-error"]').text()).toContain(
      'JSON 对象',
    );

    await editor.setValue('{"series":[{"type":"bar","data":[1,2]}]}');
    await wrapper.get('[data-testid="update-chart-option"]').trigger('click');
    expect(
      wrapper
        .emitted('update')
        ?.some(([patch]) => JSON.stringify(patch).includes('"type":"bar"')),
    ).toBe(true);
  });
});
