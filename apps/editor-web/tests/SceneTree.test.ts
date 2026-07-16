import {
  createDefaultSceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SceneTree from '../src/components/editor/SceneTree.vue';

function node(
  id: string,
  name: string,
  parentId: string | null,
  childIds: string[] = [],
): SceneNode {
  return {
    id,
    parentId,
    childIds,
    name,
    enabled: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    components: [{ kind: 'geometry', primitive: 'box' }],
    businessData: {},
  };
}

describe('SceneTree', () => {
  it('按 childIds 恢复层级顺序，搜索子节点时保留祖先', async () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    document.nodes = {
      parent: node('parent', '厂房', null, ['child']),
      child: node('child', '子泵站', 'parent'),
      outside: node('outside', '室外管线', null),
    };
    document.rootNodeIds = ['parent', 'outside'];
    const wrapper = mount(SceneTree, {
      props: {
        document,
        selection: { ids: [], primaryId: null },
      },
      global: { stubs: { Teleport: true } },
    });

    expect(
      wrapper
        .findAll('[data-node-id]')
        .map((item) => item.attributes('data-node-id')),
    ).toEqual(['parent', 'child', 'outside']);

    await wrapper.get('[aria-label="搜索场景节点"]').setValue('子泵');

    await vi.waitFor(() => {
      expect(
        wrapper
          .get('[data-node-id="parent"]')
          .element.closest('.el-tree-node')
          ?.classList.contains('is-hidden'),
      ).toBe(false);
      expect(
        wrapper
          .get('[data-node-id="child"]')
          .element.closest('.el-tree-node')
          ?.classList.contains('is-hidden'),
      ).toBe(false);
      expect(
        wrapper
          .get('[data-node-id="outside"]')
          .element.closest('.el-tree-node')
          ?.classList.contains('is-hidden'),
      ).toBe(true);
    });
  });

  it('点击、Ctrl/Cmd 多选以及显隐和锁定操作只向外发出意图', async () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    document.nodes = {
      first: node('first', '水泵 A', null),
      second: node('second', '水泵 B', null),
    };
    document.rootNodeIds = ['first', 'second'];
    const wrapper = mount(SceneTree, {
      props: {
        document,
        selection: { ids: ['first'], primaryId: 'first' },
      },
      global: { stubs: { Teleport: true } },
    });

    await wrapper
      .get('[data-node-id="second"] .scene-tree-label')
      .trigger('click', { ctrlKey: true });
    expect(wrapper.emitted('select')?.at(-1)).toEqual([
      { ids: ['first', 'second'], primaryId: 'second' },
    ]);

    await wrapper
      .get('[data-node-id="first"] [aria-label="隐藏水泵 A"]')
      .trigger('click');
    await wrapper
      .get('[data-node-id="first"] [aria-label="锁定水泵 A"]')
      .trigger('click');
    expect(wrapper.emitted('toggle-visible')?.at(-1)).toEqual(['first', false]);
    expect(wrapper.emitted('toggle-locked')?.at(-1)).toEqual(['first', true]);
    await wrapper.get('[aria-label="复制水泵 A"]').trigger('click');
    await wrapper.get('[aria-label="组合选中节点"]').trigger('click');
    expect(wrapper.emitted('duplicate')?.at(-1)).toEqual(['first']);
    expect(wrapper.emitted('group')?.at(-1)).toEqual([['first']]);
    expect(document.nodes.first?.enabled).toBe(true);
    expect(document.nodes.first?.locked).toBe(false);
  });
});
