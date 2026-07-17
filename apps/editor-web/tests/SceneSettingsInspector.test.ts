import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { BUILTIN_ENVIRONMENT_ASSETS } from '@digital-twin/three-engine';
import { mount } from '@vue/test-utils';
import { ElOption, ElSelect, ElSlider } from 'element-plus';
import { describe, expect, it } from 'vitest';
import SceneSettingsInspector from '../src/components/editor/SceneSettingsInspector.vue';

function defaultSettings() {
  return createDefaultSceneDocument('project-1', 'scene-1', '场景').settings;
}

describe('SceneSettingsInspector', () => {
  it('完整呈现源站四组设置、枚举和默认 Venice', () => {
    const wrapper = mount(SceneSettingsInspector, {
      props: {
        settings: defaultSettings(),
        assets: [],
        builtinEnvironmentPreviewUrl: '/venice-preview.jpg',
      },
    });

    const sections = wrapper
      .findAll('.project-settings-title')
      .map((element) => element.text());
    expect(sections).toEqual(['渲染器', '场景', '地面', '天气']);
    expect(
      wrapper
        .findComponent('[data-testid="tone-mapping"]')
        .findAllComponents(ElOption),
    ).toHaveLength(8);
    expect(
      wrapper
        .findComponent('[data-testid="shadow-map"]')
        .findAllComponents(ElOption),
    ).toHaveLength(4);
    expect(
      wrapper
        .findComponent('[data-testid="ground-type"]')
        .findAllComponents(ElOption),
    ).toHaveLength(9);
    expect(
      wrapper
        .findComponent('[data-testid="weather-type"]')
        .findAllComponents(ElOption),
    ).toHaveLength(3);
    expect(
      wrapper.get('[data-testid="environment-preview"]').attributes('src'),
    ).toBe('/venice-preview.jpg');
    expect(wrapper.get('[data-testid="environment-hint"]').text()).toContain(
      '内置 Venice HDR',
    );
    expect(
      wrapper.get('[data-testid="exposure"]').attributes('aria-valuemin'),
    ).toBe('0');
  });

  it('只在匹配类型下显示背景、雾和天气条件字段', async () => {
    const wrapper = mount(SceneSettingsInspector, {
      props: { settings: defaultSettings(), assets: [] },
    });
    expect(
      wrapper.find('[data-testid="background-texture-fields"]').exists(),
    ).toBe(false);
    expect(wrapper.find('[data-testid="fog-linear-fields"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="fog-density"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="weather-fields"]').exists()).toBe(false);

    await wrapper.setProps({
      settings: {
        ...defaultSettings(),
        backgroundType: 'texture',
        fogType: 'linear',
        weatherType: 'rain',
      },
    });
    expect(
      wrapper.find('[data-testid="background-texture-fields"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[data-testid="fog-linear-fields"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="fog-density"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="weather-fields"]').exists()).toBe(true);
    expect(
      wrapper.get('[data-testid="weather-count"]').attributes('aria-valuemax'),
    ).toBe('100000');
  });

  it('以单个历史命令 patch 提交控件变更和文件', async () => {
    const wrapper = mount(SceneSettingsInspector, {
      props: { settings: defaultSettings(), assets: [] },
    });
    const selects = wrapper.findAllComponents(ElSelect);
    selects[0]!.vm.$emit('change', 'agx');
    selects[1]!.vm.$emit('change', 'vsm');
    wrapper.findAllComponents(ElSlider)[0]!.vm.$emit('change', 2.2);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update')).toEqual([
      [{ toneMapping: 'agx' }],
      [{ shadowMapType: 'vsm' }],
      [{ exposure: 2.2 }],
    ]);

    const file = new File(['hdr'], 'factory.hdr', {
      type: 'application/octet-stream',
    });
    const input = wrapper.get('[data-testid="environment-file"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    expect(wrapper.emitted('upload-environment')?.at(-1)).toEqual([file]);
    expect(input.attributes('accept')).toBe('.jpg,.png,.hdr');
  });

  it('展示六张内置环境图并以环境资源 ID 提交选择', async () => {
    const wrapper = mount(SceneSettingsInspector, {
      props: { settings: defaultSettings(), assets: [] },
    });
    const presets = wrapper.findAll('[data-testid^="environment-preset-"]');
    expect(presets).toHaveLength(BUILTIN_ENVIRONMENT_ASSETS.length);

    await presets[0]!.trigger('click');
    expect(wrapper.emitted('update')?.at(-1)).toEqual([
      {
        environmentEnabled: true,
        environmentAssetId: BUILTIN_ENVIRONMENT_ASSETS[0]!.id,
      },
    ]);
  });

  it('文档对象原地更新时按变更代次刷新环境预览', async () => {
    const settings = defaultSettings();
    const wrapper = mount(SceneSettingsInspector, {
      props: { settings, assets: [], changeVersion: 0 },
    });
    settings.environmentAssetId = BUILTIN_ENVIRONMENT_ASSETS[0]!.id;
    await wrapper.setProps({ changeVersion: 1 });

    expect(
      wrapper.get('[data-testid="environment-preview"]').attributes('src'),
    ).toMatch(/cathedral\.png$/);
  });
});
