import type { RenderStats, SceneStats } from '@digital-twin/three-engine';
import { mount } from '@vue/test-utils';
import { ElTooltip } from 'element-plus';
import { describe, expect, it } from 'vitest';
import AssetPalette from '../src/components/editor/AssetPalette.vue';
import EditorTopBar from '../src/components/editor/EditorTopBar.vue';
import ViewportStats from '../src/components/editor/ViewportStats.vue';
import ViewportToolbar from '../src/components/editor/ViewportToolbar.vue';

describe('编辑器高密度框架组件', () => {
  it('顶栏保留保存、重置、预览和发布入口，撤销重做仅由快捷键触发', async () => {
    const wrapper = mount(EditorTopBar, {
      props: {
        sceneName: '厂区场景',
        saveStateLabel: '已保存',
      },
    });

    expect(wrapper.text()).toContain('厂区场景');
    expect(wrapper.text()).toContain('Three r183');
    await wrapper.get('[data-testid="save-scene"]').trigger('click');
    await wrapper.get('[data-testid="back-to-project"]').trigger('click');
    await wrapper.get('[data-testid="reset-scene"]').trigger('click');
    await wrapper.get('[data-testid="preview-scene"]').trigger('click');
    await wrapper.get('[data-testid="publish-scene"]').trigger('click');

    expect(wrapper.emitted('save')).toHaveLength(1);
    expect(wrapper.emitted('back-to-project')).toHaveLength(1);
    expect(wrapper.emitted('reset')).toHaveLength(1);
    expect(wrapper.emitted('preview')).toHaveLength(1);
    expect(wrapper.emitted('publish')).toHaveLength(1);
    expect(wrapper.find('[data-testid="undo-scene"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="redo-scene"]').exists()).toBe(false);
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

  it('视口工具按源站顺序显示八个能力并转发操作', async () => {
    const wrapper = mount(ViewportToolbar, {
      props: {
        mode: 'translate',
        isPointerLock: false,
        isMeasuring: false,
        isChooseAllModel: true,
      },
    });

    expect(wrapper.get('[data-tool="translate"]').classes()).toContain(
      'active',
    );
    expect(wrapper.findAll('.transform-controls-item')).toHaveLength(8);
    expect(wrapper.findAllComponents(ElTooltip)).toHaveLength(8);
    expect(wrapper.findAll('.viewport-element-icon')).toHaveLength(8);
    expect(wrapper.find('.iconfont').exists()).toBe(false);
    expect(
      wrapper
        .findAll('.transform-controls-item')
        .every((button) => button.attributes('title') === undefined),
    ).toBe(true);
    expect(
      wrapper
        .findAllComponents(ElTooltip)
        .map((tooltip) => tooltip.props('content')),
    ).toEqual([
      '拖拽（快捷键：W）',
      '旋转（快捷键：E）',
      '缩放（快捷键：R）',
      '对齐所有模型到地面',
      '当前视角：第三人称',
      '测量工具',
      '重置场景相机位置(鼠标无法控制相机时)',
      '鼠标单击选中整个模型:已开启',
    ]);
    await wrapper.get('[data-tool="rotate"]').trigger('click');
    await wrapper.get('[data-tool="align-ground"]').trigger('click');
    await wrapper.get('[data-tool="pointer-lock"]').trigger('click');
    await wrapper.get('[data-tool="measure"]').trigger('click');
    await wrapper.get('[data-tool="reset-camera"]').trigger('click');
    await wrapper.get('[data-tool="choose-all"]').trigger('click');

    expect(wrapper.emitted('mode')?.at(-1)).toEqual(['rotate']);
    expect(wrapper.emitted('align-ground')).toHaveLength(1);
    expect(wrapper.emitted('pointer-lock')).toHaveLength(1);
    expect(wrapper.emitted('measure')).toHaveLength(1);
    expect(wrapper.emitted('reset')).toHaveLength(1);
    expect(wrapper.emitted('choose-all')?.at(-1)).toEqual([false]);
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
