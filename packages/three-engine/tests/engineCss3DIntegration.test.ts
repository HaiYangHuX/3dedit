import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(file: 'EditorEngine.ts' | 'RuntimeThreeEngine.ts'): string {
  return readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
}

describe('Editor/Runtime CSS3D integration', () => {
  it.each(['EditorEngine.ts', 'RuntimeThreeEngine.ts'] as const)(
    '%s 对称管理 CSS3D 图表渲染生命周期',
    (file) => {
      const code = source(file);
      expect(code).toContain('new Css3DOverlaySystem');
      expect(code).toContain('this.css3dOverlay?.resize(width, height)');
      expect(code).toContain('this.css3dOverlay?.render()');
      expect(code).toContain('this.css3dOverlay?.dispose()');
    },
  );

  it('编辑器把图表 DOM 选择和双击聚焦接入统一选择链路', () => {
    const code = source('EditorEngine.ts');
    expect(code).toContain('onSelect: this.selectFromCss3D');
    expect(code).toContain('onDoubleClick: this.focusFromCss3D');
  });

  it('运行时优先订阅图表 DOM 事件并把动作映射到真实组件', () => {
    const code = source('RuntimeThreeEngine.ts');
    expect(code).toContain('this.documentSystem?.subscribeNodeEvent');
    expect(code).toContain('setText: (nodeId, text)');
    expect(code).toContain('setChartData: (nodeId, data)');
  });
});
