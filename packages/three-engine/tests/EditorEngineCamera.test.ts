import {
  createDefaultSceneDocument,
  type SceneCamera,
} from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import { EditorEngine } from '../src/index.js';

describe('EditorEngine Camera bridge', () => {
  it('应用完整 Camera DTO、Orbit target 和投影参数并可读回', () => {
    const engine = new EditorEngine();
    const update = vi.fn();
    const projection = vi.spyOn(engine.camera, 'updateProjectionMatrix');
    Object.assign(engine, {
      controls: { target: engine.camera.position.clone(), update },
    });
    const camera: SceneCamera = {
      type: 'perspective',
      name: '主相机',
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [1, 1, 1],
      target: [4, 0.5, 6],
      visible: false,
      castShadow: true,
      receiveShadow: true,
      frustumCulled: false,
      fov: 60,
      near: 0.1,
      far: 30_000,
    };

    engine.applyCamera(camera);

    expect(engine.getCameraState()).toEqual(camera);
    expect(update).not.toHaveBeenCalled();
    expect(projection).toHaveBeenCalled();
  });

  it('按稳定路径 ID 播放并在路径列表替换时停止旧漫游', () => {
    const engine = new EditorEngine();
    const preview = vi.fn(() => true);
    const stopPreview = vi.fn();
    const cancelDrawing = vi.fn();
    Object.assign(engine, {
      cameraRoamingSystem: {
        preview,
        stopPreview,
        cancelDrawing,
        getState: vi.fn(() => ({
          mode: 'idle',
          pointCount: 0,
          activePathId: null,
        })),
      },
      pointerLockSystem: { deactivate: vi.fn() },
      measurementSystem: { end: vi.fn() },
      cameraSystem: { cancel: vi.fn() },
      selectionSystem: { setSelection: vi.fn(), setEnabled: vi.fn() },
      transformSystem: { setSelection: vi.fn() },
    });
    const document = createDefaultSceneDocument('project', 'scene', '场景');
    document.cameraRoamingList = [
      {
        id: 'path-1',
        name: '漫游路径 1',
        pathPoints: [
          [0, 0.55, 0],
          [4, 0.55, 4],
        ],
      },
    ];

    engine.applyCameraRoamingList(document.cameraRoamingList);
    expect(engine.previewCameraRoaming('path-1')).toBe(true);
    expect(preview).toHaveBeenCalledWith(document.cameraRoamingList[0]);
    expect(engine.previewCameraRoaming('missing')).toBe(false);

    engine.applyCameraRoamingList([]);
    expect(stopPreview).toHaveBeenCalled();
    expect(cancelDrawing).toHaveBeenCalled();
  });
});
