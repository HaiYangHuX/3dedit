import type {
  CameraOrientation,
  RenderStats,
  SceneStats,
} from '@digital-twin/three-engine';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AssetPalette from '../src/components/editor/AssetPalette.vue';
import EditorTopBar from '../src/components/editor/EditorTopBar.vue';
import ViewportGizmo from '../src/components/editor/ViewportGizmo.vue';
import ViewportStats from '../src/components/editor/ViewportStats.vue';
import ViewportToolbar from '../src/components/editor/ViewportToolbar.vue';

describe('编辑器高密度框架组件', () => {
  it('顶栏转发撤销、保存、预览和发布意图', async () => {
    const wrapper = mount(EditorTopBar, {
      props: {
        sceneName: '厂区场景',
        saveStateLabel: '已保存',
        canUndo: true,
        canRedo: false,
      },
    });

    expect(wrapper.text()).toContain('厂区场景');
    expect(wrapper.text()).toContain('Three r183');
    await wrapper.get('[data-testid="undo-scene"]').trigger('click');
    await wrapper.get('[data-testid="save-scene"]').trigger('click');
    await wrapper.get('[data-testid="preview-scene"]').trigger('click');
    await wrapper.get('[data-testid="publish-scene"]').trigger('click');

    expect(wrapper.emitted('undo')).toHaveLength(1);
    expect(wrapper.emitted('save')).toHaveLength(1);
    expect(wrapper.emitted('preview')).toHaveLength(1);
    expect(wrapper.emitted('publish')).toHaveLength(1);
    expect(
      wrapper.get('[data-testid="redo-scene"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('左侧竖向分类轨道更新类别并保留内容插槽', async () => {
    const wrapper = mount(AssetPalette, {
      props: { active: 'model' },
      slots: { default: '<div data-testid="palette-content">模型列表</div>' },
    });

    expect(wrapper.findAll('.asset-category-item')).toHaveLength(7);
    expect(wrapper.get('[data-asset-category="model"]').classes()).toContain(
      'active',
    );
    await wrapper.get('[data-asset-category="light"]').trigger('click');
    expect(wrapper.emitted('update:active')?.at(-1)).toEqual(['light']);
    expect(wrapper.get('[data-testid="palette-content"]').text()).toBe(
      '模型列表',
    );
  });

  it('视口工具显示模式状态并转发空间、相机和显示操作', async () => {
    const wrapper = mount(ViewportToolbar, {
      props: {
        mode: 'translate',
        space: 'world',
        gridVisible: true,
        isFullscreen: false,
      },
    });

    expect(wrapper.get('[data-tool="translate"]').classes()).toContain(
      'active',
    );
    await wrapper.get('[data-tool="rotate"]').trigger('click');
    await wrapper.get('[data-tool="space"]').trigger('click');
    await wrapper.get('[data-tool="focus"]').trigger('click');
    await wrapper.get('[data-tool="reset-camera"]').trigger('click');
    await wrapper.get('[data-tool="screenshot"]').trigger('click');
    await wrapper.get('[data-tool="fullscreen"]').trigger('click');

    expect(wrapper.emitted('mode')?.at(-1)).toEqual(['rotate']);
    expect(wrapper.emitted('space')?.at(-1)).toEqual(['local']);
    expect(wrapper.emitted('focus')).toHaveLength(1);
    expect(wrapper.emitted('reset')).toHaveLength(1);
    expect(wrapper.emitted('screenshot')).toHaveLength(1);
    expect(wrapper.emitted('fullscreen')).toHaveLength(1);
  });

  it('纯 DOM 方向方块随四元数旋转并提供六个视图按钮', async () => {
    const orientation: CameraOrientation = { quaternion: [0, 0, 0, 1] };
    const wrapper = mount(ViewportGizmo, {
      props: { quaternion: orientation.quaternion },
    });
    const initial = wrapper.get('.viewport-gizmo-cube').attributes('style');

    expect(wrapper.findAll('[data-view]')).toHaveLength(6);
    await wrapper.setProps({ quaternion: [0, 0.7071, 0, 0.7071] });
    expect(wrapper.get('.viewport-gizmo-cube').attributes('style')).not.toBe(
      initial,
    );
    await wrapper.get('[data-view="top"]').trigger('click');
    expect(wrapper.emitted('view')?.at(-1)).toEqual(['top']);
  });

  it('统计浮层组合场景数据与限频渲染数据', () => {
    const scene: SceneStats = {
      objectCount: 4,
      meshCount: 6,
      vertexCount: 12_345,
      faceCount: 6_789,
    };
    const render: RenderStats = { fps: 60, drawCalls: 8 };
    const wrapper = mount(ViewportStats, { props: { scene, render } });

    expect(wrapper.text()).toContain('12,345');
    expect(wrapper.text()).toContain('6,789');
    expect(wrapper.text()).toContain('60');
    expect(wrapper.text()).toContain('8');
  });
});
