import type { TextComponent, TextMethod } from '@digital-twin/scene-schema';

const PIXEL_SCALE = 6;
const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", Arial, sans-serif';

export interface CanvasSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

export type CanvasSurfaceFactory = (
  width: number,
  height: number,
) => CanvasSurface;

export interface TextCanvasRenderOptions {
  createSurface?: CanvasSurfaceFactory;
}

function createBrowserSurface(width: number, height: number): CanvasSurface {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * PIXEL_SCALE));
  canvas.height = Math.max(1, Math.ceil(height * PIXEL_SCALE));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持 Canvas 2D 文本渲染');
  context.scale(PIXEL_SCALE, PIXEL_SCALE);
  return { canvas, context };
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safe = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safe, y);
  context.arcTo(x + width, y, x + width, y + height, safe);
  context.arcTo(x + width, y + height, x, y + height, safe);
  context.arcTo(x, y + height, x, y, safe);
  context.arcTo(x, y, x + width, y, safe);
  context.closePath();
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const source = text.length > 0 ? text : ' ';
  const lines: string[] = [];
  let line = '';
  for (const character of Array.from(source)) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCenteredText(
  context: CanvasRenderingContext2D,
  component: TextComponent,
  width: number,
  centerY: number,
  maxWidth: number,
  weight: number | 'normal' | 'bold' = 'bold',
): void {
  context.font = `${weight} ${component.fontSize}px ${FONT_FAMILY}`;
  context.fillStyle = component.color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lines = wrapText(context, component.textContent, maxWidth);
  const lineHeight = component.fontSize * 1.3;
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, width / 2, startY + index * lineHeight);
  });
}

function drawPlain(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const scratch = createSurface(1, 1);
  scratch.context.font = `${component.fontSize}px ${FONT_FAMILY}`;
  const lines = wrapText(scratch.context, component.textContent, 300);
  const textWidth = Math.max(
    component.fontSize,
    ...lines.map((line) => scratch.context.measureText(line).width),
  );
  const lineHeight = component.fontSize * 1.2;
  const width = Math.max(40, textWidth + 40);
  const height = Math.max(32, lines.length * lineHeight + 20);
  const { canvas, context } = createSurface(width, height);
  context.clearRect(0, 0, width, height);
  context.font = `${component.fontSize}px ${FONT_FAMILY}`;
  context.fillStyle = component.color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  lines.forEach((line, index) => {
    context.fillText(line, width / 2, 10 + lineHeight / 2 + index * lineHeight);
  });
  return canvas;
}

function drawFixed(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 180;
  const height = 130;
  const { canvas, context } = createSurface(width, height);
  const gradient = context.createLinearGradient(
    12,
    18,
    width - 12,
    height - 18,
  );
  gradient.addColorStop(0, 'rgba(3, 19, 38, 0.94)');
  gradient.addColorStop(1, 'rgba(0, 83, 126, 0.82)');
  roundRect(context, 12, 18, width - 24, height - 42, 4);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = '#00eaff';
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = '#00eaff';
  context.fillRect(12, 18, 5, height - 42);
  context.beginPath();
  context.arc(width / 2, height - 13, 3, 0, Math.PI * 2);
  context.fill();
  drawCenteredText(context, component, width, 61, width - 48);
  return canvas;
}

function drawMotion(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 320;
  const height = 200;
  const { canvas, context } = createSurface(width, height);
  const gradient = context.createLinearGradient(20, 25, 300, 175);
  gradient.addColorStop(0, 'rgba(0, 20, 38, 0.92)');
  gradient.addColorStop(1, 'rgba(0, 102, 128, 0.68)');
  roundRect(context, 22, 28, 276, 126, 8);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = '#00f0ff';
  context.lineWidth = 2;
  context.stroke();
  context.strokeStyle = 'rgba(0, 240, 255, 0.35)';
  context.strokeRect(34, 40, 252, 102);
  context.beginPath();
  context.arc(54, 60, 12, 0, Math.PI * 2);
  context.strokeStyle = '#00f0ff';
  context.stroke();
  context.fillStyle = '#00f0ff';
  context.fillRect(49, 58, 10, 4);
  for (let index = 0; index < 8; index += 1) {
    context.fillStyle = `rgba(0, 240, 255, ${0.18 + index * 0.05})`;
    context.fillRect(42 + index * 31, 165, 18, 3);
  }
  drawCenteredText(context, component, width, 96, 220);
  return canvas;
}

function drawMusic(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 320;
  const height = 180;
  const { canvas, context } = createSurface(width, height);
  const gradient = context.createLinearGradient(20, 20, 300, 160);
  gradient.addColorStop(0, 'rgba(29, 16, 60, 0.92)');
  gradient.addColorStop(1, 'rgba(8, 54, 88, 0.9)');
  roundRect(context, 18, 24, 284, 132, 10);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = '#a855f7';
  context.lineWidth = 1.5;
  context.stroke();
  const bars = [18, 34, 23, 46, 31, 52, 27, 41, 20];
  bars.forEach((bar, index) => {
    const barGradient = context.createLinearGradient(0, 118 - bar, 0, 118);
    barGradient.addColorStop(0, '#22d3ee');
    barGradient.addColorStop(1, '#a855f7');
    context.fillStyle = barGradient;
    context.fillRect(36 + index * 15, 118 - bar, 7, bar);
  });
  context.textAlign = 'left';
  drawCenteredText(context, component, width + 96, 86, 130);
  return canvas;
}

function drawTech(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 200;
  const height = 120;
  const { canvas, context } = createSurface(width, height);
  roundRect(context, 12, 14, 176, 78, 4);
  context.fillStyle = 'rgba(235, 248, 255, 0.9)';
  context.fill();
  context.strokeStyle = '#38bdf8';
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = '#0ea5e9';
  context.fillRect(12, 14, 176, 7);
  context.fillRect(25, 101, 150, 2);
  context.fillStyle = '#0f172a';
  context.font = `bold ${component.fontSize}px ${FONT_FAMILY}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  wrapText(context, component.textContent, 148).forEach((line, index) => {
    context.fillText(line, width / 2, 49 + index * component.fontSize * 1.2);
  });
  return canvas;
}

function drawFashion(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 240;
  const height = 120;
  const { canvas, context } = createSurface(width, height);
  const gradient = context.createLinearGradient(10, 10, 230, 110);
  gradient.addColorStop(0, 'rgba(1, 27, 49, 0.92)');
  gradient.addColorStop(0.55, 'rgba(0, 88, 112, 0.82)');
  gradient.addColorStop(1, 'rgba(3, 18, 36, 0.94)');
  roundRect(context, 10, 14, 220, 82, 6);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = '#00f3ff';
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = '#00f3ff';
  context.fillRect(20, 25, 32, 3);
  context.fillRect(width - 52, height - 37, 32, 3);
  context.shadowColor = '#00f3ff';
  context.shadowBlur = 5;
  drawCenteredText(context, component, width, 56, 188);
  context.shadowBlur = 0;
  return canvas;
}

function drawWestern(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 200;
  const height = 160;
  const { canvas, context } = createSurface(width, height);
  const gradient = context.createLinearGradient(15, 15, 185, 110);
  gradient.addColorStop(0, 'rgba(169, 114, 80, 0.94)');
  gradient.addColorStop(0.45, 'rgba(204, 142, 105, 0.94)');
  gradient.addColorStop(1, 'rgba(117, 73, 48, 0.96)');
  roundRect(context, 15, 15, 170, 105, 3);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = 'rgba(75, 42, 24, 0.75)';
  context.lineWidth = 2;
  context.stroke();
  // 固定纹理避免每次编辑文本时随机木纹导致面板整体闪烁。
  for (let index = 0; index < 12; index += 1) {
    context.beginPath();
    context.moveTo(25 + ((index * 17) % 145), 28 + ((index * 23) % 76));
    context.lineTo(36 + ((index * 29) % 135), 32 + ((index * 31) % 72));
    context.strokeStyle = 'rgba(80, 50, 30, 0.28)';
    context.lineWidth = 0.6;
    context.stroke();
  }
  context.shadowColor = 'rgba(35, 20, 10, 0.75)';
  context.shadowBlur = 2;
  drawCenteredText(context, component, width, 68, 140);
  context.shadowBlur = 0;
  return canvas;
}

function drawCampus(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 200;
  const height = 150;
  const { canvas, context } = createSurface(width, height);
  roundRect(context, 14, 15, 172, 102, 6);
  context.fillStyle = 'rgba(230, 248, 236, 0.94)';
  context.fill();
  context.strokeStyle = '#22c55e';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#16a34a';
  context.fillRect(14, 15, 172, 24);
  context.fillStyle = '#ffffff';
  context.font = `bold 11px ${FONT_FAMILY}`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText('CAMPUS MONITOR', 24, 27);
  context.fillStyle = component.color;
  context.font = `bold ${component.fontSize}px ${FONT_FAMILY}`;
  context.textAlign = 'center';
  wrapText(context, component.textContent, 140).forEach((line, index) => {
    context.fillText(line, width / 2, 69 + index * component.fontSize * 1.2);
  });
  return canvas;
}

function drawDigitalTwin(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 300;
  const height = 100;
  const { canvas, context } = createSurface(width, height);
  const gradient = context.createLinearGradient(0, 10, 0, 70);
  gradient.addColorStop(0, 'rgba(0, 48, 86, 0.75)');
  gradient.addColorStop(1, 'rgba(0, 24, 43, 0.92)');
  roundRect(context, 10, 10, 280, 60, 4);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = '#00a2ff';
  context.lineWidth = 2;
  context.stroke();
  context.strokeStyle = '#00eaff';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(10, 25);
  context.lineTo(10, 10);
  context.lineTo(25, 10);
  context.moveTo(290, 55);
  context.lineTo(290, 70);
  context.lineTo(275, 70);
  context.stroke();
  context.shadowColor = 'rgba(0, 162, 255, 0.8)';
  context.shadowBlur = 5;
  drawCenteredText(context, component, width, 40, 230);
  context.shadowBlur = 0;
  return canvas;
}

function drawIot(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 360;
  const height = 100;
  const { canvas, context } = createSurface(width, height);
  const gradient = context.createLinearGradient(10, 10, 350, 90);
  gradient.addColorStop(0, 'rgba(10, 18, 30, 0.9)');
  gradient.addColorStop(1, 'rgba(5, 10, 18, 0.96)');
  roundRect(context, 10, 10, 340, 80, 8);
  context.fillStyle = gradient;
  context.fill();
  const border = context.createLinearGradient(10, 0, 350, 0);
  border.addColorStop(0, '#10b981');
  border.addColorStop(0.5, '#00f2fe');
  border.addColorStop(1, '#0072ff');
  context.strokeStyle = border;
  context.lineWidth = 1.5;
  context.stroke();
  context.strokeStyle = 'rgba(0, 242, 254, 0.5)';
  context.beginPath();
  context.arc(55, 50, 27, 0, Math.PI * 2);
  context.moveTo(28, 50);
  context.lineTo(82, 50);
  context.moveTo(55, 23);
  context.lineTo(55, 77);
  context.stroke();
  context.fillStyle = '#10b981';
  context.beginPath();
  context.arc(55, 50, 4, 0, Math.PI * 2);
  context.fill();
  context.font = `bold 10px ${FONT_FAMILY}`;
  context.textAlign = 'left';
  context.fillText('ONLINE', 285, 25);
  context.font = `bold ${component.fontSize}px ${FONT_FAMILY}`;
  context.fillStyle = component.color;
  context.textBaseline = 'middle';
  wrapText(context, component.textContent, 235).forEach((line, index) => {
    context.fillText(line, 96, 48 + index * component.fontSize * 1.25);
  });
  return canvas;
}

function drawHologram(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 380;
  const height = 120;
  const { canvas, context } = createSurface(width, height);
  const gradient = context.createLinearGradient(0, 20, 0, 94);
  gradient.addColorStop(0, 'rgba(18, 60, 90, 0.58)');
  gradient.addColorStop(0.5, 'rgba(12, 35, 70, 0.74)');
  gradient.addColorStop(1, 'rgba(28, 20, 68, 0.82)');
  roundRect(context, 16, 24, 348, 72, 9);
  context.fillStyle = gradient;
  context.fill();
  const border = context.createLinearGradient(16, 0, 364, 0);
  border.addColorStop(0, '#22d3ee');
  border.addColorStop(0.5, '#e879f9');
  border.addColorStop(1, '#22d3ee');
  context.strokeStyle = border;
  context.lineWidth = 1.5;
  context.stroke();
  context.strokeStyle = 'rgba(103, 232, 249, 0.25)';
  for (let x = 30; x < 350; x += 20) {
    context.beginPath();
    context.moveTo(x, 30);
    context.lineTo(x - 8, 90);
    context.stroke();
  }
  context.shadowColor = '#67e8f9';
  context.shadowBlur = 6;
  drawCenteredText(context, component, width, 60, 300);
  context.shadowBlur = 0;
  return canvas;
}

function drawCyberHud(
  component: TextComponent,
  createSurface: CanvasSurfaceFactory,
): HTMLCanvasElement {
  const width = 420;
  const height = 140;
  const { canvas, context } = createSurface(width, height);
  context.fillStyle = 'rgba(12, 8, 18, 0.92)';
  context.beginPath();
  context.moveTo(18, 28);
  context.lineTo(44, 12);
  context.lineTo(388, 12);
  context.lineTo(406, 32);
  context.lineTo(392, 112);
  context.lineTo(34, 112);
  context.lineTo(14, 92);
  context.closePath();
  context.fill();
  const border = context.createLinearGradient(14, 0, 406, 0);
  border.addColorStop(0, '#f43f5e');
  border.addColorStop(0.55, '#facc15');
  border.addColorStop(1, '#22d3ee');
  context.strokeStyle = border;
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#f43f5e';
  context.fillRect(34, 27, 48, 4);
  context.fillStyle = '#facc15';
  context.fillRect(338, 94, 48, 4);
  context.font = `bold 10px ${FONT_FAMILY}`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = '#f43f5e';
  context.fillText('SYS // TRACK', 34, 43);
  context.shadowColor = '#22d3ee';
  context.shadowBlur = 5;
  drawCenteredText(context, component, width, 72, 330);
  context.shadowBlur = 0;
  return canvas;
}

const renderers: Record<
  TextMethod,
  (
    component: TextComponent,
    createSurface: CanvasSurfaceFactory,
  ) => HTMLCanvasElement
> = {
  CreatePlainTextCanvas: drawPlain,
  CreateFixedCanvas: drawFixed,
  CreateMotionCanvas: drawMotion,
  CreateMusicCanvas: drawMusic,
  CreateTechCanvas: drawTech,
  CreateFashionCanvas: drawFashion,
  CreateWesternCanvas: drawWestern,
  CreateCampusCanvas: drawCampus,
  CreateDigitalTwin: drawDigitalTwin,
  CreateIotSensing: drawIot,
  CreateHologramPanel: drawHologram,
  CreateCyberHud: drawCyberHud,
};

export function renderTextCanvas(
  component: TextComponent,
  options: TextCanvasRenderOptions = {},
): HTMLCanvasElement {
  return renderers[component.textMethod](
    component,
    options.createSurface ?? createBrowserSurface,
  );
}
