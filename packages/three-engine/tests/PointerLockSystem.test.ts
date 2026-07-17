import { describe, expect, it, vi } from 'vitest';
import {
  calculatePointerLockMove,
  requestPointerLockSafely,
} from '../src/interaction/PointerLockSystem.js';

describe('PointerLockSystem', () => {
  it('沿用源站每帧 delta * 0.1 * 48 的第一人称移动步长', () => {
    expect(calculatePointerLockMove(0.016)).toBeCloseTo(0.0768);
    expect(calculatePointerLockMove(-1)).toBe(0);
  });

  it('浏览器拒绝 Pointer Lock 时消费 Promise rejection 并通知状态回滚', async () => {
    const error = new Error('pointer lock denied');
    const onRejected = vi.fn();
    const element = {
      requestPointerLock: vi.fn(() => Promise.reject(error)),
    } as unknown as HTMLElement;

    requestPointerLockSafely(element, onRejected);
    await Promise.resolve();
    await Promise.resolve();

    expect(onRejected).toHaveBeenCalledWith(error);
  });
});
