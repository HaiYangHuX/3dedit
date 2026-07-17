import { describe, expect, it } from 'vitest';
import { calculatePointerLockMove } from '../src/interaction/PointerLockSystem.js';

describe('PointerLockSystem', () => {
  it('沿用源站每帧 delta * 0.1 * 48 的第一人称移动步长', () => {
    expect(calculatePointerLockMove(0.016)).toBeCloseTo(0.0768);
    expect(calculatePointerLockMove(-1)).toBe(0);
  });
});
