import type { ActionDefinition } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  ActionRunner,
  type RuntimeActionContext,
  type RuntimeHost,
} from '../src/index.js';

function createHost(events: string[]): RuntimeHost {
  return {
    isNodeVisible: () => true,
    setVisibility: (nodeId, visible) => {
      events.push(`visible:${nodeId}:${visible}`);
    },
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
    subscribeNodeEvent: () => () => undefined,
  };
}

function createContext(events: string[]): RuntimeActionContext {
  const variables = new Map<string, unknown>();
  return {
    getVariable: (key) => variables.get(key),
    setVariable: (key, value) => {
      variables.set(key, value);
      events.push(`${key}:${String(value)}`);
    },
  };
}

describe('ActionRunner', () => {
  it('串行动作严格等待 delay 后再执行下一项', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const runner = new ActionRunner(createHost(events));
    const actions: ActionDefinition[] = [
      { type: 'set-variable', key: 'phase', value: 1 },
      { type: 'delay', durationMs: 20 },
      { type: 'set-variable', key: 'phase', value: 2 },
    ];

    const running = runner.run(actions, 'sequential', createContext(events));
    await vi.advanceTimersByTimeAsync(19);
    expect(events).toEqual(['phase:1']);
    await vi.advanceTimersByTimeAsync(1);
    await running;
    expect(events).toEqual(['phase:1', 'phase:2']);
    vi.useRealTimers();
  });

  it('并行动作同时开始且 abort 会清理延迟动作', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const diagnostics = vi.fn();
    const runner = new ActionRunner(createHost(events), diagnostics);
    const controller = new AbortController();

    const running = runner.run(
      [
        { type: 'delay', durationMs: 100 },
        { type: 'set-visibility', nodeId: 'device', visible: false },
      ],
      'parallel',
      createContext(events),
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(['visible:device:false']);
    controller.abort();
    await running;
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(0);
    expect(diagnostics).not.toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' }),
    );
    vi.useRealTimers();
  });
});
