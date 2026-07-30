import { TEXT_METHODS, type TextMethod } from '@digital-twin/scene-schema';
import {
  Bell,
  ChatLineSquare,
  Connection,
  Cpu,
  DataBoard,
  EditPen,
  Flag,
  MagicStick,
  Monitor,
  Postcard,
  Promotion,
  Reading,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

export interface TextPaletteDefinition {
  name: string;
  icon: Component;
}

const textDefinitions: Record<TextMethod, TextPaletteDefinition> = {
  CreatePlainTextCanvas: { name: '纯文本', icon: EditPen },
  CreateFixedCanvas: { name: '固定面板', icon: Postcard },
  CreateMotionCanvas: { name: '动效面板', icon: Promotion },
  CreateMusicCanvas: { name: '音乐文本', icon: Bell },
  CreateTechCanvas: { name: '科技文本', icon: Cpu },
  CreateFashionCanvas: { name: '时尚文本', icon: MagicStick },
  CreateWesternCanvas: { name: '西部文本', icon: Flag },
  CreateCampusCanvas: { name: '校园文本', icon: Reading },
  CreateDigitalTwin: { name: '数字孪生', icon: DataBoard },
  CreateIotSensing: { name: '物联感知', icon: Connection },
  CreateHologramPanel: { name: '全息面板', icon: Monitor },
  CreateCyberHud: { name: '赛博 HUD', icon: ChatLineSquare },
};

export const TEXT_PALETTE_ITEMS = TEXT_METHODS.map((textMethod) => ({
  textMethod,
  ...textDefinitions[textMethod],
}));

export function getTextDefinition(
  textMethod: TextMethod,
): TextPaletteDefinition {
  return textDefinitions[textMethod];
}
