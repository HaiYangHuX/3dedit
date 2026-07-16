import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SocketTaskPanel from '../src/components/editor/SocketTaskPanel.vue';

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

describe('SocketTaskPanel', () => {
  it('创建数据源和位置任务时以一个 runtime patch 提交', async () => {
    const wrapper = mount(SocketTaskPanel, {
      props: { nodes: [node], dataSources: [], socketTasks: [] },
    });

    await wrapper.get('[data-testid="add-data-source"]').trigger('click');
    await wrapper.get('[data-testid="add-socket-task"]').trigger('click');

    const commits = wrapper.emitted('commit');
    const latest = commits?.at(-1)?.[0];
    expect(latest).toMatchObject({
      dataSources: [
        expect.objectContaining({ type: 'websocket', enabled: true }),
      ],
      socketTasks: [
        expect.objectContaining({
          taskType: 'ModelPosition',
          targetNodeId: 'device',
        }),
      ],
    });
  });

  it('模拟消息不是合法 JSON 时不发送', async () => {
    const wrapper = mount(SocketTaskPanel, {
      props: { nodes: [node], dataSources: [], socketTasks: [] },
    });
    await wrapper.get('[data-testid="simulate-message-json"]').setValue('{');
    await wrapper
      .get('[data-testid="simulate-socket-message"]')
      .trigger('click');

    expect(wrapper.text()).toContain('模拟消息 JSON 格式错误');
    expect(wrapper.emitted('simulate')).toBeUndefined();
  });
});
