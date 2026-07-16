import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('RuntimeThreeEngine 依赖边界', () => {
  it('只依赖 runtime-core，不导入编辑选择或 TransformControls', () => {
    expect(packageJson.dependencies).toHaveProperty(
      '@digital-twin/runtime-core',
      'workspace:*',
    );
    const source = readFileSync(
      new URL('../src/RuntimeThreeEngine.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('TransformControls');
    expect(source).not.toContain('SelectionSystem');
    expect(source).not.toContain('@digital-twin/editor-core');
    expect(source).toContain('RuntimeHostAdapter');
  });
});
