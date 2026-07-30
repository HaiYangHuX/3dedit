import { z } from 'zod';

export const TEXT_METHODS = [
  'CreatePlainTextCanvas',
  'CreateFixedCanvas',
  'CreateMotionCanvas',
  'CreateMusicCanvas',
  'CreateTechCanvas',
  'CreateFashionCanvas',
  'CreateWesternCanvas',
  'CreateCampusCanvas',
  'CreateDigitalTwin',
  'CreateIotSensing',
  'CreateHologramPanel',
  'CreateCyberHud',
] as const;

export const textMethodSchema = z.enum(TEXT_METHODS);
export const textTypeSchema = z.enum(['Sprite', 'Mesh']);

export const textComponentSchema = z.object({
  kind: z.literal('text'),
  textMethod: textMethodSchema,
  textType: textTypeSchema,
  color: z.string().min(1),
  fontSize: z.number().min(8).max(24),
  textContent: z.string().max(100),
});

export type TextMethod = z.infer<typeof textMethodSchema>;
export type TextType = z.infer<typeof textTypeSchema>;
export type TextComponent = z.infer<typeof textComponentSchema>;

export interface TextDefinition {
  name: string;
  color: string;
  fontSize: number;
  textContent: string;
}

/**
 * 模板顺序、字号和配色与生产素材面板一致；示例内容使用当前产品的中性文案，
 * 避免把模板来源方的品牌和联系方式写入用户场景。
 */
export const TEXT_DEFINITIONS: Record<TextMethod, TextDefinition> = {
  CreatePlainTextCanvas: {
    name: '纯文本',
    color: '#ffffff',
    fontSize: 16,
    textContent: '数字孪生场景编辑器',
  },
  CreateFixedCanvas: {
    name: '样式一',
    color: '#ffffff',
    fontSize: 16,
    textContent: '设备运行状态',
  },
  CreateMotionCanvas: {
    name: '样式二',
    color: '#ffffff',
    fontSize: 16,
    textContent: '智能物联网系统',
  },
  CreateMusicCanvas: {
    name: '样式三',
    color: '#ffffff',
    fontSize: 20,
    textContent: '实时数据',
  },
  CreateTechCanvas: {
    name: '样式四',
    color: 'rgba(0, 0, 0, 0.8)',
    fontSize: 16,
    textContent: '基于 Three.js 的数字孪生场景',
  },
  CreateFashionCanvas: {
    name: '样式五',
    color: '#ffffff',
    fontSize: 16,
    textContent: '设备状态：正常',
  },
  CreateWesternCanvas: {
    name: '样式六',
    color: '#ffffff',
    fontSize: 16,
    textContent: '智慧工厂',
  },
  CreateCampusCanvas: {
    name: '样式七',
    color: 'rgba(0, 0, 0, 0.8)',
    fontSize: 16,
    textContent: '园区实时监控',
  },
  CreateDigitalTwin: {
    name: '样式八',
    color: '#ffffff',
    fontSize: 16,
    textContent: '数字孪生',
  },
  CreateIotSensing: {
    name: '样式九 (物联网感知)',
    color: '#ffffff',
    fontSize: 15,
    textContent: '温度传感器: 24.5℃ | 湿度: 45%',
  },
  CreateHologramPanel: {
    name: '样式十 (全息面板)',
    color: '#e8ffff',
    fontSize: 15,
    textContent: '全息节点 · 数据链路已建立',
  },
  CreateCyberHud: {
    name: '样式十一 (赛博HUD)',
    color: '#ffffff',
    fontSize: 15,
    textContent: 'TARGET LOCKED · 区域A-07',
  },
};

export function createDefaultTextComponent(
  textMethod: TextMethod,
): TextComponent {
  const definition = TEXT_DEFINITIONS[textMethod];
  return {
    kind: 'text',
    textMethod,
    textType: 'Sprite',
    color: definition.color,
    fontSize: definition.fontSize,
    textContent: definition.textContent,
  };
}
