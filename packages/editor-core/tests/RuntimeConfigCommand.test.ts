import {
  createDefaultSceneDocument,
  type DataSourceDefinition,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  CommandHistory,
  UpdateRuntimeConfigCommand,
  type EditorDocumentContext,
} from '../src/index.js';

describe('UpdateRuntimeConfigCommand', () => {
  it('一次提交多个运行时区段并整体撤销', async () => {
    const document = createDefaultSceneDocument('project', 'scene', '场景');
    const context: EditorDocumentContext = {
      document,
      onChanged: vi.fn(),
    };
    const history = new CommandHistory(context);
    const source: DataSourceDefinition = {
      id: 'source-1',
      name: '设备数据',
      type: 'websocket',
      url: 'ws://127.0.0.1:18080',
      enabled: true,
      heartbeatMs: 10_000,
      reconnectLimit: 5,
    };

    await history.execute(
      new UpdateRuntimeConfigCommand({
        dataSources: [source],
        socketTasks: [],
      }),
    );
    expect(document.dataSources).toEqual([source]);
    expect(context.onChanged).toHaveBeenCalledTimes(1);

    await history.undo();
    expect(document.dataSources).toEqual([]);
    expect(document.socketTasks).toEqual([]);
  });
});
