import {
  createDefaultSceneDocument,
  type SceneNode,
} from '@digital-twin/scene-schema';
import { mount } from '@vue/test-utils';
import { ElTooltip } from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import SceneTree from '../src/components/editor/SceneTree.vue';
import { MODEL_INSTANCE_NAME_VERSION_KEY } from '../src/editor/createSceneNode';

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
  it('Camera 行可选择并显示独立 current，不伪装成 SceneNode', async () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const wrapper = mount(SceneTree, {
      props: {
        document,
        selection: { ids: [], primaryId: null },
        cameraSelected: true,
      },
      global: { stubs: { Teleport: true } },
    });
    const camera = wrapper.get('[data-testid="scene-camera"]');

    expect(camera.classes('is-selected')).toBe(true);
    await camera.trigger('click');
    expect(wrapper.emitted('select-camera')).toHaveLength(1);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('显示 Camera 和固定两级模型列表，并可独立选择二级项', async () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const model = node('model', '酸洗清洗机.glb', null);
    model.components = [{ kind: 'model', assetId: 'asset-1' }];
    document.nodes = { model };
    document.rootNodeIds = [model.id];
    const wrapper = mount(SceneTree, {
      props: {
        document,
        selection: { ids: ['model'], primaryId: 'model' },
        selectedModelPart: { nodeId: 'model', objectId: 'mesh-frame' },
        modelAssetFormats: { 'asset-1': 'glb' },
        modelStructures: {
          model: [
            {
              objectId: 'mesh-frame',
              targetObjectId: 'mesh-frame',
              partPath: '0',
              name: '刀具库框架-材质',
              objectType: 'Mesh',
            },
            {
              objectId: 'material-shell',
              targetObjectId: 'mesh-shell',
              partPath: '1',
              name: '外壳材质',
              objectType: 'MeshStandardMaterial',
            },
          ],
        },
      },
      global: { stubs: { Teleport: true } },
    });

    expect(wrapper.get('[data-testid="scene-camera"]').text()).toContain(
      'Camera',
    );
    expect(
      wrapper.get('[data-node-id="model"] .scene-tree-name').text(),
    ).toMatch(/^酸洗清洗机\.glb_\d{4}$/);
    expect(
      wrapper
        .findAll('[data-object-id]')
        .map((item) => item.attributes('data-object-id')),
    ).toEqual(['mesh-frame', 'material-shell']);
    expect(
      wrapper
        .find('[data-object-id] .el-tree-node__children [data-object-id]')
        .exists(),
    ).toBe(false);
    expect(
      wrapper
        .get('[data-object-id="mesh-frame"]')
        .element.closest('.el-tree-node')
        ?.classList.contains('is-current'),
    ).toBe(true);
    expect(wrapper.get('[data-node-id="model"]').classes('is-selected')).toBe(
      false,
    );
    expect(wrapper.findAll('.scene-tree-element-icon').length).toBeGreaterThan(
      2,
    );
    expect(wrapper.findAllComponents(ElTooltip)).toHaveLength(7);
    expect(wrapper.find('.scene-tree-toolbar').exists()).toBe(false);
    expect(
      wrapper.get('[data-node-id="model"] [aria-label="删除酸洗清洗机.glb"]'),
    ).toBeDefined();
    await wrapper
      .get('[data-node-id="model"] [aria-label="删除酸洗清洗机.glb"]')
      .trigger('click');
    expect(wrapper.emitted('remove')?.at(-1)).toEqual(['model']);

    await wrapper
      .get('[data-object-id="mesh-frame"] [aria-label="删除刀具库框架-材质"]')
      .trigger('click');
    expect(wrapper.emitted('remove-model-part')?.at(-1)).toEqual([
      {
        nodeId: 'model',
        partPath: '0',
        objectId: 'mesh-frame',
      },
    ]);

    await wrapper
      .get('[data-object-id="material-shell"] .scene-tree-label')
      .trigger('click');
    expect(wrapper.emitted('select-model-part')?.at(-1)).toEqual([
      {
        nodeId: 'model',
        objectId: 'material-shell',
        targetObjectId: 'mesh-shell',
      },
    ]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('用所属模型和对象 UUID 组成二级 current，避免共享材质双重高亮', () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const first = node('first-model', '模型 A.glb_0001', null);
    const second = node('second-model', '模型 B.glb_0002', null);
    first.components = [{ kind: 'model', assetId: 'asset-1' }];
    second.components = [{ kind: 'model', assetId: 'asset-1' }];
    document.nodes = { 'first-model': first, 'second-model': second };
    document.rootNodeIds = ['first-model', 'second-model'];
    const sharedPart = {
      objectId: 'shared-material',
      targetObjectId: 'mesh',
      partPath: '0',
      name: '共享材质',
      objectType: 'MeshStandardMaterial',
    };
    const wrapper = mount(SceneTree, {
      props: {
        document,
        selection: { ids: ['second-model'], primaryId: 'second-model' },
        selectedModelPart: {
          nodeId: 'second-model',
          objectId: 'shared-material',
        },
        modelStructures: {
          'first-model': [sharedPart],
          'second-model': [sharedPart],
        },
      },
      global: { stubs: { Teleport: true } },
    });
    const rows = wrapper.findAll('[data-object-id="shared-material"]');

    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.classes('is-selected'))).toHaveLength(1);
    expect(rows[1]?.classes('is-selected')).toBe(true);
  });

  it('用户重命名标记存在时直接展示持久化名称', () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const model = node('model', '主水泵', null);
    model.components = [{ kind: 'model', assetId: 'asset-1' }];
    model.businessData = { [MODEL_INSTANCE_NAME_VERSION_KEY]: 1 };
    document.nodes = { model };
    document.rootNodeIds = ['model'];
    const wrapper = mount(SceneTree, {
      props: {
        document,
        selection: { ids: [], primaryId: null },
        modelAssetFormats: { 'asset-1': 'glb' },
      },
      global: { stubs: { Teleport: true } },
    });

    expect(wrapper.get('[data-node-id="model"] .scene-tree-name').text()).toBe(
      '主水泵',
    );
  });

  it('原地修改文档后通过变更代次重建根节点', async () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    const wrapper = mount(SceneTree, {
      props: {
        document,
        selection: { ids: [], primaryId: null },
        changeVersion: 0,
      },
      global: { stubs: { Teleport: true } },
    });

    document.nodes.first = node('first', '水泵 A', null);
    document.rootNodeIds.push('first');
    await wrapper.setProps({ document, changeVersion: 1 });

    expect(wrapper.get('[data-node-id="first"]').text()).toContain('水泵 A');
  });

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
    expect(wrapper.emitted('duplicate')?.at(-1)).toEqual(['first']);
    expect(document.nodes.first?.enabled).toBe(true);
    expect(document.nodes.first?.locked).toBe(false);
  });
});
