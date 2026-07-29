import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CameraInspector from '../src/components/editor/CameraInspector.vue';

describe('CameraInspector', () => {
  it('编辑位置、角度和投影字段时发出 SceneCamera patch', async () => {
    const document = createDefaultSceneDocument('project', 'scene', '场景');
    const wrapper = mount(CameraInspector, {
      props: {
        camera: document.camera,
        paths: [],
        roamingState: {
          mode: 'idle',
          pointCount: 0,
          activePathId: null,
        },
      },
      global: { stubs: { Teleport: true } },
    });

    await wrapper.get('[aria-label="相机位置 X"]').setValue('2');
    await wrapper.get('[aria-label="相机位置 X"]').trigger('change');
    expect(wrapper.emitted('update')?.at(-1)).toEqual([
      { position: [2, 3.347, 7.966] },
    ]);

    await wrapper.get('[aria-label="相机旋转 X（度）"]').setValue('90');
    await wrapper.get('[aria-label="相机旋转 X（度）"]').trigger('change');
    expect(
      (wrapper.emitted('update')?.at(-1)?.[0] as { rotation: number[] })
        .rotation[0],
    ).toBeCloseTo(Math.PI / 2);

    await wrapper.get('[aria-label="相机视野角"]').setValue('60');
    await wrapper.get('[aria-label="相机视野角"]').trigger('change');
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ fov: 60 }]);
  });

  it('漫游页签显示路径点数并转发新增、播放、停止和删除意图', async () => {
    const document = createDefaultSceneDocument('project', 'scene', '场景');
    document.cameraRoamingList = [
      {
        id: 'path-1',
        name: '漫游路径 1',
        speed: 4,
        pathPoints: [
          [0, 0.55, 0],
          [4, 0.55, 4],
        ],
      },
    ];
    const wrapper = mount(CameraInspector, {
      props: {
        camera: document.camera,
        paths: document.cameraRoamingList,
        roamingState: {
          mode: 'idle',
          pointCount: 0,
          activePathId: null,
        },
      },
      global: { stubs: { Teleport: true } },
    });
    const tabs = wrapper.findAll('.el-tabs__item');
    await tabs.find((tab) => tab.text() === '相机漫游')!.trigger('click');

    expect(wrapper.text()).toContain('2 个点');
    await wrapper.get('[aria-label="添加漫游路径"]').trigger('click');
    await wrapper.get('[aria-label="播放漫游路径 1"]').trigger('click');
    await wrapper.get('[aria-label="删除漫游路径 1"]').trigger('click');
    expect(wrapper.emitted('start-drawing')).toHaveLength(1);
    expect(wrapper.emitted('preview')?.at(-1)).toEqual(['path-1']);
    expect(wrapper.emitted('remove')?.at(-1)).toEqual(['path-1']);

    await wrapper.setProps({
      roamingState: {
        mode: 'previewing',
        pointCount: 0,
        activePathId: 'path-1',
      },
    });
    await wrapper.get('[aria-label="停止漫游路径 1"]').trigger('click');
    expect(wrapper.emitted('stop')).toHaveLength(1);
  });

  it('漫游卡片支持悬停显示路径、速度配置和三维点位编辑', async () => {
    const document = createDefaultSceneDocument('project', 'scene', '场景');
    document.cameraRoamingList = [
      {
        id: 'path-1',
        name: '漫游路径 1',
        speed: 4,
        pathPoints: [
          [0, 0.55, 0],
          [4, 0.55, 4],
        ],
      },
    ];
    const wrapper = mount(CameraInspector, {
      props: {
        camera: document.camera,
        paths: document.cameraRoamingList,
        roamingState: {
          mode: 'idle',
          pointCount: 0,
          activePathId: null,
        },
      },
      global: { stubs: { Teleport: true } },
    });
    await wrapper
      .findAll('.el-tabs__item')
      .find((tab) => tab.text() === '相机漫游')!
      .trigger('click');

    const card = wrapper.get('.cr-item');
    await card.trigger('mouseenter');
    await card.trigger('mouseleave');
    expect(wrapper.emitted('hover')?.at(-1)).toEqual(['path-1']);
    expect(wrapper.emitted('leave')).toHaveLength(1);

    const speedInput = wrapper.get(
      '[data-testid="roaming-speed-path-1"] input',
    );
    await speedInput.setValue('6.5');
    await speedInput.trigger('change');
    expect(wrapper.emitted('update-speed')?.at(-1)).toEqual(['path-1', 6.5]);

    await wrapper.get('[aria-label="编辑漫游路径 1 点位"]').trigger('click');
    const firstX = wrapper.get('[data-testid="roaming-point-0-x"] input');
    await firstX.setValue('1.25');
    await wrapper.get('[aria-label="保存漫游点位"]').trigger('click');
    expect(wrapper.emitted('update-points')?.at(-1)).toEqual([
      'path-1',
      [
        [1.25, 0.55, 0],
        [4, 0.55, 4],
      ],
    ]);
  });
});
