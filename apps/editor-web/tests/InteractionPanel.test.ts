import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import InteractionPanel from '../src/components/editor/InteractionPanel.vue';

const node = {
  id: 'device',
  parentId: null,
  childIds: [],
  name: '设备',
  enabled: true,
  locked: false,
  transform: {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  },
  components: [],
  businessData: {},
};

describe('InteractionPanel', () => {
  it('为当前节点创建可通过强类型协议的 click 交互', async () => {
    const wrapper = mount(InteractionPanel, {
      props: {
        nodes: [node],
        interactions: [],
        dataSources: [],
      },
    });

    await wrapper.get('[data-testid="add-interaction"]').trigger('click');

    const commits = wrapper.emitted('commit');
    expect(commits).toHaveLength(1);
    expect(commits?.[0]?.[0]).toMatchObject({
      interactions: [
        {
          sourceNodeId: 'device',
          trigger: { type: 'click' },
          actions: [
            {
              type: 'toggle-visibility',
              nodeId: 'device',
            },
          ],
        },
      ],
    });
  });

  it('动作 JSON 非法时阻止应用并显示中文错误', async () => {
    const wrapper = mount(InteractionPanel, {
      props: {
        nodes: [node],
        interactions: [
          {
            id: 'interaction-1',
            name: '单击事件',
            enabled: true,
            sourceNodeId: 'device',
            trigger: { type: 'click' },
            conditions: { logic: 'all', conditions: [] },
            execution: 'sequential',
            actions: [{ type: 'toggle-visibility', nodeId: 'device' }],
          },
        ],
        dataSources: [],
      },
    });
    await wrapper.get('[data-testid="interaction-actions-json"]').setValue('{');
    await wrapper.get('[data-testid="apply-interaction"]').trigger('click');

    expect(wrapper.text()).toContain('动作 JSON 格式错误');
    expect(wrapper.emitted('commit')).toBeUndefined();
  });
});
