import type {
  SocketTaskDefinition,
  SocketTaskType,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  SocketTaskRunner,
  WebSocketRuntime,
  type RuntimeHost,
  type WebSocketLike,
} from '../src/index.js';

function task(
  taskType: SocketTaskType,
  taskData: Record<string, unknown>,
): SocketTaskDefinition {
  return {
    id: `task-${taskType}`,
    dataSourceId: 'socket-1',
    taskCode: 'device-task',
    taskType,
    targetNodeId: 'device',
    taskTime: 300,
    taskData,
  } as SocketTaskDefinition;
}

function createHost(): RuntimeHost {
  return {
    isNodeVisible: () => true,
    setVisibility: vi.fn(),
    setTransform: vi.fn(),
    setColor: vi.fn(),
    setHighlight: vi.fn(),
    focusNode: vi.fn(),
    controlAnimation: vi.fn(),
    controlVideo: vi.fn(),
    setText: vi.fn(),
    setChartData: vi.fn(),
    switchScene: vi.fn(),
    openLink: vi.fn(),
    openPopup: vi.fn(),
    subscribeNodeEvent: () => () => undefined,
  };
}

describe('SocketTaskRunner', () => {
  it('按 taskCode 将位置消息映射为带持续时间的 Host 变换', async () => {
    const host = createHost();
    const runner = new SocketTaskRunner(
      [task('ModelPosition', { x: 0, y: 0, z: 0 })],
      host,
    );

    const result = await runner.run('socket-1', {
      taskCode: 'device-task',
      taskTime: 500,
      taskData: { x: 10, y: 0, z: 5 },
    });

    expect(result?.taskCode).toBe('device-task');
    expect(host.setTransform).toHaveBeenCalledWith(
      'device',
      { position: [10, 0, 5] },
      { durationMs: 500, easing: 'linear' },
    );
  });

  it('非法任务数据只写诊断，不调用 Host', async () => {
    const host = createHost();
    const onDiagnostic = vi.fn();
    const runner = new SocketTaskRunner(
      [task('ModelPosition', { x: 0, y: 0, z: 0 })],
      host,
      onDiagnostic,
    );

    await runner.run('socket-1', {
      taskCode: 'device-task',
      taskData: { x: 'not-a-number', y: 0, z: 5 },
    });

    expect(host.setTransform).not.toHaveBeenCalled();
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning', source: 'socket' }),
    );
  });
});

describe('WebSocketRuntime', () => {
  it('解析批量 JSON 消息并回传每个已执行 taskCode', async () => {
    const host = createHost();
    const onTask = vi.fn();
    const runtime = new WebSocketRuntime({
      host,
      createSocket: () =>
        ({
          readyState: 0,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          send: () => undefined,
          close: () => undefined,
        }) satisfies WebSocketLike,
      onTask,
    });
    runtime.start({
      dataSources: [
        {
          id: 'socket-1',
          name: '设备数据',
          type: 'websocket',
          url: 'ws://127.0.0.1:18080',
          enabled: true,
          autoConnect: false,
          heartbeatMs: 10_000,
          reconnectLimit: 3,
        },
      ],
      socketTasks: [task('ModelVisible', { visible: true })],
    });

    await runtime.injectMessage(
      'socket-1',
      JSON.stringify([
        { taskCode: 'device-task', taskData: { visible: false } },
        { taskCode: 'device-task', taskData: { visible: true } },
      ]),
    );

    expect(host.setVisibility).toHaveBeenCalledTimes(2);
    expect(onTask).toHaveBeenCalledTimes(2);
    runtime.stop();
  });
});
