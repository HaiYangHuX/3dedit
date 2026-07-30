import type { ShaderMethod, Transform } from '@digital-twin/scene-schema';
import {
  Aim,
  DataAnalysis,
  Grid,
  Lightning,
  MagicStick,
  Odometer,
  Position,
  Refresh,
  Right,
  Timer,
  TrendCharts,
  Warning,
  WarningFilled,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

export interface ShaderDefinition {
  name: string;
  rotation: Transform['rotation'];
  icon: Component;
}

/** 名称、初始方向和图标的唯一来源；顺序与原站 ShaderMethod 枚举一致。 */
const shaderDefinitions: Record<ShaderMethod, ShaderDefinition> = {
  CreateWarningShader: {
    name: '警告标记',
    rotation: [Math.PI / 2, 0, 0],
    icon: WarningFilled,
  },
  CreateCompassShader: {
    name: '罗盘',
    rotation: [Math.PI / 2, 0, 0],
    icon: Position,
  },
  CreateRadarShader: {
    name: '扫描雷达',
    rotation: [Math.PI / 2, 0, 0],
    icon: Aim,
  },
  CreateWallShader: {
    name: '流动墙体',
    rotation: [0, 0, 0],
    icon: TrendCharts,
  },
  CreateApertureShader: {
    name: '收缩光环',
    rotation: [Math.PI / 2, 0, 0],
    icon: Refresh,
  },
  CreateFlickerWarning: {
    name: '异常点闪烁',
    rotation: [-Math.PI / 2, 0, 0],
    icon: Warning,
  },
  CreateWarningApertureShader: {
    name: '警告光圈',
    rotation: [0, 0, 0],
    icon: Odometer,
  },
  CreateElectronicFence: {
    name: '电子围栏',
    rotation: [0, 0, 0],
    icon: Grid,
  },
  CreateWarningGuardrail: {
    name: '警告护栏',
    rotation: [0, 0, 0],
    icon: DataAnalysis,
  },
  CreateWarningGuardrailBreath: {
    name: '红色呼吸护栏',
    rotation: [0, 0, 0],
    icon: Timer,
  },
  CreateLogisticsConveyor: {
    name: '物流传送带',
    rotation: [-Math.PI / 2, 0, 0],
    icon: Right,
  },
  CreateHologramBeam: {
    name: '全息能量光柱',
    rotation: [0, 0, 0],
    icon: Lightning,
  },
  CreateHexTechPlatform: {
    name: '六边形科技底座',
    rotation: [-Math.PI / 2, 0, 0],
    icon: MagicStick,
  },
};

/** 当前线上面板没有展示罗盘，保留方法兼容但不擅自增加 UI 入口。 */
export const SHADER_PALETTE_ITEMS = (
  [
    'CreateWarningShader',
    'CreateRadarShader',
    'CreateWallShader',
    'CreateApertureShader',
    'CreateFlickerWarning',
    'CreateWarningApertureShader',
    'CreateElectronicFence',
    'CreateWarningGuardrail',
    'CreateWarningGuardrailBreath',
    'CreateLogisticsConveyor',
    'CreateHologramBeam',
    'CreateHexTechPlatform',
  ] as const
).map((shaderMethod) => ({
  shaderMethod,
  ...shaderDefinitions[shaderMethod],
}));

export function getShaderDefinition(
  shaderMethod: ShaderMethod,
): ShaderDefinition {
  return shaderDefinitions[shaderMethod];
}
