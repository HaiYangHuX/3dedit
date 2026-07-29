import { flushPromises, mount } from '@vue/test-utils';
import { ElImage, ElUpload } from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import CoverImagePicker from '../src/components/CoverImagePicker.vue';

describe('CoverImagePicker', () => {
  it('使用 ElImage 展示封面并通过放大按钮打开预览', async () => {
    const wrapper = mount(CoverImagePicker, {
      props: {
        modelValue: null,
        src: 'https://assets.test/cover.png',
        fallback: '封',
      },
      global: { stubs: { Teleport: true } },
    });
    await flushPromises();

    const image = wrapper.getComponent(ElImage);
    expect(image.props('previewSrcList')).toEqual([
      'https://assets.test/cover.png',
    ]);
    await wrapper.get('[aria-label="放大预览"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('.el-image-viewer__wrapper').exists()).toBe(true);
  });

  it('选择和移除封面时使用同一组事件', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:selected-cover');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const wrapper = mount(CoverImagePicker, {
      props: { modelValue: null, src: '', fallback: '封' },
      global: { stubs: { Teleport: true } },
    });
    const file = new File(['cover'], 'cover.webp', { type: 'image/webp' });
    const onChange = wrapper
      .getComponent(ElUpload)
      .props('onChange') as (value: { raw: File }) => void;

    onChange({ raw: file });
    await wrapper.setProps({ modelValue: file });

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([file]);
    expect(wrapper.emitted('change')?.[0]).toEqual([file]);
    expect(wrapper.getComponent(ElImage).props('src')).toBe(
      'blob:selected-cover',
    );

    await wrapper.get('[aria-label="移除封面"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([null]);
  });
});
