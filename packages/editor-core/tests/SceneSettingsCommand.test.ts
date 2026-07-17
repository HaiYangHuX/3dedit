import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  UpdateSceneSettingsCommand,
  type EditorDocumentContext,
} from '../src/index.js';

describe('UpdateSceneSettingsCommand', () => {
  it('以可撤销命令更新背景、曝光和网格显示', () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const changed = vi.fn();
    const context: EditorDocumentContext = { document, onChanged: changed };
    const command = new UpdateSceneSettingsCommand({
      background: '#020617',
      exposure: 1.5,
      gridVisible: false,
    });

    command.execute(context);
    expect(document.settings).toMatchObject({
      background: '#020617',
      exposure: 1.5,
      gridVisible: false,
    });

    command.undo(context);
    expect(document.settings).toMatchObject({
      background: '#3b3b3b',
      exposure: 1.2,
      gridVisible: true,
    });
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
