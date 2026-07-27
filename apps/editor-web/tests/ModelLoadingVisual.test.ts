import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorRoot = process.cwd();

describe('模型 Loading 视觉资源', () => {
  it('HUD SVG 根节点不声明背景色', () => {
    const svg = readFileSync(
      resolve(editorRoot, 'public/loading/hud-spinner.svg'),
      'utf8',
    );
    const rootTag = svg.match(/<svg\b[^>]*>/)?.[0] ?? '';

    expect(rootTag).not.toMatch(/background\s*:/i);
  });

  it('画布中的 HUD 显示为 96px 正方形', () => {
    const styles = readFileSync(
      resolve(editorRoot, 'src/styles/editor.scss'),
      'utf8',
    );
    const spinnerRule =
      styles.match(/\.editor-model-loading__spinner\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(spinnerRule).toMatch(/width:\s*96px;/);
    expect(spinnerRule).toMatch(/height:\s*96px;/);
  });
});
