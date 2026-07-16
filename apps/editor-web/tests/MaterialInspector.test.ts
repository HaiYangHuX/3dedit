import type { Asset } from '@digital-twin/api-contracts';
import {
  createDefaultMaterialComponent,
  type MaterialComponent,
} from '@digital-twin/scene-schema';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MaterialInspector from '../src/components/editor/MaterialInspector.vue';

const texture: Asset = {
  id: 'texture-1',
  name: '金属颜色',
  kind: 'image',
  format: 'png',
  status: 'ready',
  category: '贴图',
  tags: [],
  favorite: false,
  sourceHash: 'a'.repeat(64),
  metadata: {},
  error: null,
  retryCount: 0,
  thumbnailUrl: 'https://assets.test/thumbnail.png',
  sourceSize: 128,
  referenceCount: 0,
  createdAt: '2026-07-16T08:00:00.000Z',
  updatedAt: '2026-07-16T08:00:00.000Z',
};

function latestUpdate(wrapper: ReturnType<typeof mount>): MaterialComponent {
  return wrapper.emitted('update')?.at(-1)?.[0] as MaterialComponent;
}

describe('MaterialInspector', () => {
  it('为没有覆盖的模型创建完整 Standard 默认材质', async () => {
    const wrapper = mount(MaterialInspector);

    await wrapper.get('[data-testid="enable-material"]').trigger('click');

    expect(latestUpdate(wrapper)).toMatchObject({
      kind: 'material',
      materialType: 'standard',
      roughness: 0.72,
      textures: { baseColor: null, normal: null },
    });
  });

  it('提交类型、通用参数以及各材质专属 PBR 参数', async () => {
    const component = createDefaultMaterialComponent();
    const wrapper = mount(MaterialInspector, { props: { component } });

    await wrapper.get('[data-testid="material-type"]').setValue('physical');
    expect(latestUpdate(wrapper).materialType).toBe('physical');
    await wrapper.setProps({
      component: { ...component, materialType: 'physical' },
    });
    await wrapper.get('[data-testid="material-clearcoat"]').setValue('0.8');
    expect(latestUpdate(wrapper).clearcoat).toBe(0.8);
    await wrapper.get('[data-testid="material-opacity"]').setValue('0.45');
    expect(latestUpdate(wrapper)).toMatchObject({
      opacity: 0.45,
      transparent: true,
    });
    await wrapper.get('[data-testid="material-side"]').setValue('double');
    expect(latestUpdate(wrapper).side).toBe('double');
  });

  it('选择贴图、修改独立 UV 绑定并可清除和恢复原材质', async () => {
    const component = createDefaultMaterialComponent();
    const wrapper = mount(MaterialInspector, {
      props: { component, textureAssets: [texture] },
    });

    await wrapper.get('[data-testid="texture-baseColor"]').setValue(texture.id);
    let next = latestUpdate(wrapper);
    expect(next.textures.baseColor).toMatchObject({
      assetId: texture.id,
      repeat: [1, 1],
      wrapS: 'repeat',
    });

    await wrapper.setProps({ component: next });
    await wrapper
      .get('[data-testid="texture-baseColor-repeat-x"]')
      .setValue('2.5');
    next = latestUpdate(wrapper);
    expect(next.textures.baseColor?.repeat).toEqual([2.5, 1]);

    await wrapper.setProps({ component: next });
    await wrapper.get('[data-testid="texture-baseColor"]').setValue('');
    expect(latestUpdate(wrapper).textures.baseColor).toBeNull();

    await wrapper.get('[data-testid="restore-material"]').trigger('click');
    expect(wrapper.emitted('restore')).toHaveLength(1);
  });
});
