import {
  createDefaultSceneDocument,
  type SceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import { SceneRuntime, type RuntimeHost } from '../src/index.js';

type NodeEvent = 'click' | 'double-click' | 'pointer-enter' | 'pointer-leave';

function node(id: string): SceneNode {
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
    components: [],
    businessData: {},
  };
}

function interactiveDocument(): SceneDocument {
  const document = createDefaultSceneDocument('project', 'scene', '运行场景');
  document.nodes.button = node('button');
  document.nodes.device = node('device');
  document.rootNodeIds = ['button', 'device'];
  document.interactions = [
    {
      id: 'click-show',
      name: '单击显示设备',
      enabled: true,
      sourceNodeId: 'button',
      trigger: { type: 'click' },
      conditions: {
        logic: 'all',
        conditions: [
          {
            left: { source: 'variable', key: 'enabled' },
            operator: 'eq',
            right: { source: 'literal', value: true },
          },
        ],
      },
      execution: 'sequential',
      actions: [{ type: 'set-visibility', nodeId: 'device', visible: true }],
    },
    {
      id: 'load-phase',
      name: '加载变量',
      enabled: true,
      sourceNodeId: 'button',
      trigger: { type: 'scene-load' },
      conditions: { logic: 'all', conditions: [] },
      execution: 'sequential',
      actions: [{ type: 'set-variable', key: 'loaded', value: true }],
    },
  ];
  return document;
}

function createHost() {
  const listeners = new Map<string, () => void>();
  const setVisibility = vi.fn();
  const host: RuntimeHost = {
    isNodeVisible: () => false,
    setVisibility,
    setTransform: async () => undefined,
    setColor: async () => undefined,
    setHighlight: () => undefined,
    focusNode: async () => undefined,
    controlAnimation: () => undefined,
    controlVideo: () => undefined,
    setText: () => undefined,
    setChartData: () => undefined,
    switchScene: () => undefined,
    openLink: () => undefined,
    openPopup: () => undefined,
    subscribeNodeEvent: (nodeId, event, listener) => {
      listeners.set(`${event}:${nodeId}`, listener);
      return () => listeners.delete(`${event}:${nodeId}`);
    },
  };
  return {
    host,
    setVisibility,
    emit(event: NodeEvent, nodeId: string) {
      listeners.get(`${event}:${nodeId}`)?.();
    },
    get subscriptionCount() {
      return listeners.size;
    },
  };
}

describe('SceneRuntime', () => {
  it('启动时注册节点事件、执行 scene-load 并按条件触发动作', async () => {
    const fixture = createHost();
    const onInteractionSettled = vi.fn();
    const runtime = new SceneRuntime({
      host: fixture.host,
      onInteractionSettled,
    });
    runtime.load(interactiveDocument());
    runtime.setVariable('enabled', true);

    runtime.start();
    await runtime.whenIdle();
    expect(fixture.subscriptionCount).toBe(1);
    expect(runtime.getVariable('loaded')).toBe(true);

    await runtime.emitTrigger({ type: 'click', sourceNodeId: 'button' });
    expect(fixture.setVisibility).toHaveBeenCalledWith('device', true);
    expect(onInteractionSettled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'click-show' }),
      expect.objectContaining({ type: 'click', sourceNodeId: 'button' }),
    );
  });

  it('dispose 后注销订阅且晚到触发不能修改场景', async () => {
    const fixture = createHost();
    const runtime = new SceneRuntime({ host: fixture.host });
    runtime.load(interactiveDocument());
    runtime.setVariable('enabled', true);
    runtime.start();
    runtime.dispose();

    expect(fixture.subscriptionCount).toBe(0);
    fixture.emit('click', 'button');
    await runtime.emitTrigger({ type: 'click', sourceNodeId: 'button' });
    expect(fixture.setVisibility).not.toHaveBeenCalled();
  });
});
