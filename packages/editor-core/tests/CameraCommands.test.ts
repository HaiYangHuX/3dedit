import {
  createDefaultSceneDocument,
  type CameraRoamingPath,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  CommandHistory,
  UpdateCameraCommand,
  UpdateCameraRoamingListCommand,
  type EditorDocumentContext,
} from '../src/index.js';

function createContext(): EditorDocumentContext {
  return {
    document: createDefaultSceneDocument('project', 'scene', '场景'),
    onChanged: vi.fn(),
  };
}

describe('Camera commands', () => {
  it('更新 Camera 可撤销和重做，并保持未修改字段', async () => {
    const context = createContext();
    const history = new CommandHistory(context);

    await history.execute(
      new UpdateCameraCommand({
        name: '主相机',
        position: [1, 2, 3],
        fov: 60,
      }),
    );
    expect(context.document.camera).toMatchObject({
      name: '主相机',
      position: [1, 2, 3],
      fov: 60,
      near: 0.05,
      far: 20_000,
    });

    await history.undo();
    expect(context.document.camera.name).toBe('Camera');
    expect(context.document.camera.position).toEqual([0.607, 3.347, 7.966]);
    await history.redo();
    expect(context.document.camera.name).toBe('主相机');
    expect(context.onChanged).toHaveBeenCalledTimes(3);
  });

  it('路径列表使用深快照，外部修改不会污染执行和撤销', async () => {
    const context = createContext();
    const history = new CommandHistory(context);
    const paths: CameraRoamingPath[] = [
      {
        id: 'path-1',
        name: '漫游路径 1',
        pathPoints: [
          [0, 0.55, 0],
          [4, 0.55, 4],
        ],
      },
    ];
    const command = new UpdateCameraRoamingListCommand(paths);
    paths[0]!.name = '外部污染';

    await history.execute(command);
    expect(context.document.cameraRoamingList[0]?.name).toBe('漫游路径 1');
    context.document.cameraRoamingList[0]!.pathPoints[0]![0] = 99;

    await history.undo();
    expect(context.document.cameraRoamingList).toEqual([]);
    await history.redo();
    expect(context.document.cameraRoamingList[0]?.pathPoints[0]).toEqual([
      0, 0.55, 0,
    ]);
  });
});
