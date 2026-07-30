import { describe, expect, it } from 'vitest';
import {
  SHADER_PALETTE_ITEMS,
  getShaderDefinition,
} from '../src/editor/shaderPalette';

describe('shader palette', () => {
  it('按原站线上顺序展示 12 项，但完整定义仍支持罗盘', () => {
    expect(SHADER_PALETTE_ITEMS.map(({ name }) => name)).toEqual([
      '警告标记',
      '扫描雷达',
      '流动墙体',
      '收缩光环',
      '异常点闪烁',
      '警告光圈',
      '电子围栏',
      '警告护栏',
      '红色呼吸护栏',
      '物流传送带',
      '全息能量光柱',
      '六边形科技底座',
    ]);
    expect(
      SHADER_PALETTE_ITEMS.map(({ shaderMethod }) => String(shaderMethod)),
    ).not.toContain('CreateCompassShader');
    expect(getShaderDefinition('CreateCompassShader').name).toBe('罗盘');
  });

  it('水平和竖直效果使用生产包中的初始朝向', () => {
    expect(getShaderDefinition('CreateRadarShader').rotation).toEqual([
      Math.PI / 2,
      0,
      0,
    ]);
    expect(getShaderDefinition('CreateLogisticsConveyor').rotation).toEqual([
      -Math.PI / 2,
      0,
      0,
    ]);
    expect(getShaderDefinition('CreateElectronicFence').rotation).toEqual([
      0, 0, 0,
    ]);
  });
});
