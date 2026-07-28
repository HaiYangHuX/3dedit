import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorRoot = process.cwd();
const styles = readFileSync(
  resolve(editorRoot, 'src/styles/editor.scss'),
  'utf8',
);

describe('管理端共享布局密度', () => {
  it('收窄侧栏并统一压缩顶部栏和页面外边距', () => {
    expect(styles).toMatch(/\.management-sidebar\s*\{\s*flex-basis:\s*184px;/);
    expect(styles).toMatch(
      /\.management-topbar\s*\{\s*padding-right:\s*12px;\s*padding-left:\s*12px;/,
    );
    expect(styles).toMatch(
      /\.management-page\s*\{\s*padding:\s*10px 12px 16px;/,
    );
  });

  it('项目管理、项目工作台和素材库复用同一页面间距', () => {
    const viewFiles = [
      'src/views/ProjectsView.vue',
      'src/views/ProjectDetailView.vue',
      'src/views/AssetsView.vue',
    ];

    for (const file of viewFiles) {
      const source = readFileSync(resolve(editorRoot, file), 'utf8');
      expect(source).toMatch(/class="[^"]*management-page/);
    }

    expect(styles).not.toMatch(
      /\.asset-library-page\s*\{\s*padding:\s*12px 16px 20px;/,
    );
  });
});
