import { describe, expect, it } from 'vitest';
import { parseBroadcastPayload } from '../src/protocol.js';

describe('parseBroadcastPayload', () => {
  const positionMessage = {
    taskCode: 'device-position',
    taskType: 'ModelPosition',
    taskTime: 800,
    taskData: { x: 1, y: 0, z: 2 },
  } as const;

  it('normalizes one valid task message to an array', () => {
    expect(parseBroadcastPayload(positionMessage)).toEqual([positionMessage]);
  });

  it('keeps batch message order', () => {
    const visibleMessage = {
      taskCode: 'device-visible',
      taskType: 'ModelVisible',
      taskData: { visible: false },
    } as const;

    expect(parseBroadcastPayload([positionMessage, visibleMessage])).toEqual([
      positionMessage,
      visibleMessage,
    ]);
  });

  it.each([
    {},
    { taskCode: '' },
    { taskCode: 'device', taskType: 'UnknownTask' },
    { taskCode: 'device', taskTime: -1 },
    { taskCode: 'device', taskTime: 1.5 },
    { taskCode: 'device', taskData: [] },
    { taskCode: 'device', taskData: 'invalid' },
  ])('rejects an invalid task message: %j', (message) => {
    expect(() => parseBroadcastPayload(message)).toThrow();
  });

  it('rejects an empty batch because there is nothing to broadcast', () => {
    expect(() => parseBroadcastPayload([])).toThrow();
  });
});
