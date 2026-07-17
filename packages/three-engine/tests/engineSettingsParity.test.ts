import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function engineSource(
  file: 'EditorEngine.ts' | 'RuntimeThreeEngine.ts',
): string {
  return readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
}

describe('EditorEngine / RuntimeThreeEngine 项目配置一致性', () => {
  it('共用本地 Venice、Neutral、PCF 和三个设置系统', () => {
    for (const file of ['EditorEngine.ts', 'RuntimeThreeEngine.ts'] as const) {
      const source = engineSource(file);
      expect(source, file).toContain('BUILTIN_ENVIRONMENT_URL');
      expect(source, file).toContain('loadEditorEnvironment');
      expect(source, file).toContain('RoomEnvironment');
      expect(source, file).toContain('NeutralToneMapping');
      expect(source, file).toContain('PCFShadowMap');
      expect(source, file).toContain('new GroundSystem');
      expect(source, file).toContain('new WeatherSystem');
      expect(source, file).toContain('applyBackground(');
      expect(source, file).toContain('applyEnvironment(');
      expect(source, file).toContain('.groundType');
      expect(source, file).toContain('weatherSystem?.apply');
      expect(source, file).toContain('groundSystem?.update');
      expect(source, file).toContain('weatherSystem?.update');
      expect(source, file).toContain('groundSystem?.dispose');
      expect(source, file).toContain('weatherSystem?.dispose');
    }
    expect(engineSource('RuntimeThreeEngine.ts')).not.toContain(
      'ACESFilmicToneMapping',
    );
  });

  it('两端都将完整 settings 传入背景和环境系统', () => {
    for (const file of ['EditorEngine.ts', 'RuntimeThreeEngine.ts'] as const) {
      const source = engineSource(file);
      expect(source, file).toMatch(/applyBackground\(\s*document\.settings/);
      expect(source, file).toMatch(/applyEnvironment\(\s*document\.settings/);
    }
  });
});
