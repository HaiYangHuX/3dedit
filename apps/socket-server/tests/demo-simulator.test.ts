import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPositionMessage, DemoSimulator } from '../src/demo-simulator.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('createPositionMessage', () => {
  it('creates a finite horizontal circular trajectory', () => {
    expect(createPositionMessage(0, 5, 800)).toEqual({
      taskCode: 'device-position',
      taskType: 'ModelPosition',
      taskTime: 800,
      taskData: { x: 5, y: 0, z: 0 },
    });

    const quarterTurn = createPositionMessage(6, 5, 800);
    expect(quarterTurn.taskData?.x).toBeCloseTo(0, 10);
    expect(quarterTurn.taskData?.y).toBe(0);
    expect(quarterTurn.taskData?.z).toBeCloseTo(5, 10);
  });
});

describe('DemoSimulator', () => {
  it('emits immediately and then at the configured interval', async () => {
    vi.useFakeTimers();
    const broadcast = vi.fn();
    const simulator = new DemoSimulator({
      intervalMs: 1_000,
      radius: 5,
      broadcast,
    });

    expect(simulator.start()).toBe(true);
    expect(simulator.running).toBe(true);
    expect(broadcast).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);

    expect(broadcast).toHaveBeenCalledTimes(3);
  });

  it('does not create duplicate timers and stops idempotently', async () => {
    vi.useFakeTimers();
    const broadcast = vi.fn();
    const simulator = new DemoSimulator({
      intervalMs: 1_000,
      radius: 5,
      broadcast,
    });

    expect(simulator.start()).toBe(true);
    expect(simulator.start()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(broadcast).toHaveBeenCalledTimes(2);

    expect(simulator.stop()).toBe(true);
    expect(simulator.stop()).toBe(false);
    expect(simulator.running).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it('caps transition time at 800 milliseconds', () => {
    const broadcast = vi.fn();
    const simulator = new DemoSimulator({
      intervalMs: 2_000,
      radius: 5,
      broadcast,
    });

    simulator.start();

    expect(broadcast).toHaveBeenCalledWith([
      expect.objectContaining({ taskTime: 800 }),
    ]);
    simulator.stop();
  });
});
