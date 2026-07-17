import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { Group, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeThreeEngine } from '../src/index.js';

describe('RuntimeThreeEngine navigation', () => {
  it('使用编辑器同款默认 Camera，并可恢复文档 Camera 和 target', () => {
    const engine = new RuntimeThreeEngine();
    const controls = { enabled: true, target: new Vector3(), update: vi.fn() };
    Object.assign(engine, { controls });
    const document = createDefaultSceneDocument('project', 'scene', '场景');
    document.camera.position = [1, 2, 3];
    document.camera.target = [4, 0.5, 6];
    document.camera.fov = 60;

    engine.applyCamera(document.camera);

    expect(engine.camera.fov).toBe(60);
    expect(engine.camera.position.toArray()).toEqual([1, 2, 3]);
    expect(controls.target.toArray()).toEqual([4, 0.5, 6]);
    engine.resetCamera();
    expect(engine.camera.position.toArray()).toEqual([1, 2, 3]);
  });

  it('第一人称、Orbit 和漫游互斥，并按稳定路径 ID 发布状态', () => {
    const engine = new RuntimeThreeEngine();
    const pointerLock = {
      isActive: false,
      isLocked: false,
      activate: vi.fn(function (this: typeof pointerLock) {
        this.isActive = true;
      }),
      deactivate: vi.fn(function (this: typeof pointerLock) {
        this.isActive = false;
      }),
    };
    const roaming = {
      preview: vi.fn(() => true),
      stopPreview: vi.fn(),
      cancelDrawing: vi.fn(),
      getState: vi.fn(() => ({
        mode: 'idle',
        pointCount: 0,
        activePathId: null,
      })),
    };
    const listener = vi.fn();
    Object.assign(engine, {
      controls: { enabled: true, target: new Vector3(), update: vi.fn() },
      pointerLockSystem: pointerLock,
      cameraRoamingSystem: roaming,
      pointerSystem: { setEnabled: vi.fn() },
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
    const unsubscribe = engine.subscribeNavigation(listener);

    expect(engine.requestFirstPerson()).toBe(true);
    expect(engine.getNavigationState().mode).toBe('first-person');
    expect(engine.playCameraRoaming('path-1')).toBe(true);
    expect(pointerLock.deactivate).toHaveBeenCalled();
    expect(roaming.preview).toHaveBeenCalledWith(document.cameraRoamingList[0]);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('业务聚焦动作开始前退出第一人称和漫游，恢复 Orbit 业务拾取', async () => {
    const engine = new RuntimeThreeEngine();
    const object = new Group();
    const pointerLock = {
      isActive: true,
      isLocked: true,
      deactivate: vi.fn(function (this: typeof pointerLock) {
        this.isActive = false;
        this.isLocked = false;
      }),
    };
    let roamingActive = true;
    const roaming = {
      stopPreview: vi.fn(() => {
        roamingActive = false;
      }),
      getState: vi.fn(() => ({
        mode: roamingActive ? 'previewing' : 'idle',
        pointCount: 0,
        activePathId: roamingActive ? 'path-1' : null,
      })),
    };
    const pointerSystem = { setEnabled: vi.fn(), subscribe: vi.fn() };
    const controls = {
      enabled: false,
      target: new Vector3(),
      update: vi.fn(),
    };
    Object.assign(engine, {
      renderer: { domElement: {} as HTMLElement },
      outline: { selectedObjects: [] },
      controls,
      pointerLockSystem: pointerLock,
      cameraRoamingSystem: roaming,
      pointerSystem,
      documentSystem: {
        root: new Group(),
        getObject: () => object,
        getNodeId: () => undefined,
      },
    });
    (engine as unknown as { ensureRuntimePort(): void }).ensureRuntimePort();

    await engine.createHost().focusNode('node');

    expect(pointerLock.deactivate).toHaveBeenCalledOnce();
    expect(roaming.stopPreview).toHaveBeenCalledOnce();
    expect(controls.enabled).toBe(true);
    expect(pointerSystem.setEnabled).toHaveBeenLastCalledWith(true);
  });
});
