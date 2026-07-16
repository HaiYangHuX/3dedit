import type { Transform } from '@digital-twin/scene-schema';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TransformInspector from '../src/components/editor/TransformInspector.vue';

const transform: Transform = {
  position: [1, 2, 3],
  rotation: [0, Math.PI / 2, 0],
  scale: [1, 1, 1],
};

describe('TransformInspector', () => {
  it('连续输入只更新本地草稿，change 时只提交一次', async () => {
    const wrapper = mount(TransformInspector, { props: { transform } });
    const input = wrapper.get('[aria-label="位置 X"]');

    (input.element as HTMLInputElement).value = '4';
    await input.trigger('input');
    expect(wrapper.emitted('commit')).toBeUndefined();
    await input.trigger('change');

    expect(wrapper.emitted('commit')).toHaveLength(1);
    expect(wrapper.emitted('commit')?.[0]).toEqual([
      {
        before: transform,
        after: {
          position: [4, 2, 3],
          rotation: [0, Math.PI / 2, 0],
          scale: [1, 1, 1],
        },
      },
    ]);
  });

  it('开启统一缩放后修改任一轴会保持三轴相等', async () => {
    const wrapper = mount(TransformInspector, { props: { transform } });
    await wrapper.get('[aria-label="统一缩放"]').setValue(true);
    const input = wrapper.get('[aria-label="缩放 X"]');

    (input.element as HTMLInputElement).value = '2';
    await input.trigger('input');
    await input.trigger('change');

    expect(wrapper.emitted('commit')?.at(-1)?.[0]).toMatchObject({
      after: { scale: [2, 2, 2] },
    });
  });
});
