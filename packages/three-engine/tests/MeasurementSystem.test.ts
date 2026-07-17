import { describe, expect, it } from 'vitest';
import { formatMeasurementDistance } from '../src/interaction/MeasurementSystem.js';

describe('MeasurementSystem', () => {
  it('按源站比例把世界距离转换为米并保留两位小数', () => {
    expect(formatMeasurementDistance(12.345)).toBe('1.23m');
    expect(formatMeasurementDistance(100)).toBe('10.00m');
  });
});
