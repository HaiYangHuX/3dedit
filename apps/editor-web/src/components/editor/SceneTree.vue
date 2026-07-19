<script setup lang="ts">
import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import type {
  ModelAssetFormat,
  ModelPartItem,
  ModelStructureMap,
  SelectionState,
} from '@digital-twin/three-engine';
import {
  Box,
  CameraFilled,
  Collection,
  CopyDocument,
  Delete,
  EditPen,
  Grid,
  Hide,
  Lock,
  Operation,
  Search,
  Sunny,
  Unlock,
  View,
} from '@element-plus/icons-vue';
import {
  ElInput,
  ElScrollbar,
  ElTooltip,
  ElTree,
  type AllowDragFunction,
  type AllowDropFunction,
  type FilterNodeMethodFunction,
  type NodeDropType,
} from 'element-plus';
import { computed, ref, watch, type Component } from 'vue';
import {
  formatModelInstanceName,
  MODEL_INSTANCE_NAME_VERSION_KEY,
} from '../../editor/createSceneNode';

interface TreeItem {
  key: string;
  kind: 'scene-node' | 'model-part';
  id: string;
  ownerNodeId: string;
  name: string;
  objectType?: string;
  targetObjectId?: string;
  partPath?: string;
  node?: SceneNode;
  children: TreeItem[];
}

const props = withDefaults(
  defineProps<{
    document: SceneDocument;
    selection: SelectionState;
    modelStructures?: ModelStructureMap;
    modelAssetFormats?: Partial<Record<string, ModelAssetFormat>>;
    selectedModelPart?: { nodeId: string; objectId: string } | null;
    cameraSelected?: boolean;
    changeVersion?: number;
  }>(),
  {
    modelStructures: () => ({}),
    modelAssetFormats: () => ({}),
    selectedModelPart: null,
    cameraSelected: false,
    changeVersion: 0,
  },
);
const emit = defineEmits<{
  'select-camera': [];
  select: [selection: SelectionState];
  'select-model-part': [
    selection: {
      nodeId: string;
      objectId: string;
      targetObjectId: string;
    },
  ];
  'remove-model-part': [
    payload: { nodeId: string; partPath: string; objectId: string },
  ];
  'toggle-visible': [id: string, enabled: boolean];
  'toggle-locked': [id: string, locked: boolean];
  rename: [id: string, name: string];
  remove: [id: string];
  duplicate: [id: string];
  group: [ids: string[]];
  reparent: [id: string, parentId: string | null, index: number];
}>();

const query = ref('');
const treeRef = ref<InstanceType<typeof ElTree>>();

function buildModelPart(part: ModelPartItem, ownerNodeId: string): TreeItem {
  return {
    // Material 会在同一资源的多个实例之间共享，key 必须包含业务根才能全局唯一。
    key: `object:${ownerNodeId}:${part.objectId}`,
    kind: 'model-part',
    id: part.objectId,
    ownerNodeId,
    name: part.name,
    objectType: part.objectType,
    targetObjectId: part.targetObjectId,
    partPath: part.partPath,
    // 源站对深层 Mesh 做 traverse 后平铺；模型项永远不能再产生第三级。
    children: [],
  };
}

function buildSceneItem(
  id: string,
  visited: Set<string>,
): TreeItem | undefined {
  if (visited.has(id)) return undefined;
  const node = props.document.nodes[id];
  if (!node) return undefined;
  const nextVisited = new Set(visited).add(id);
  const modelParts = (props.modelStructures[id] ?? []).map((part) =>
    buildModelPart(part, id),
  );
  const businessChildren = node.childIds.flatMap((childId) => {
    const child = buildSceneItem(childId, nextVisited);
    return child ? [child] : [];
  });
  return {
    key: `node:${id}`,
    kind: 'scene-node',
    id,
    ownerNodeId: id,
    name: formatSceneNodeName(node),
    node,
    // 真实模型子结构属于当前根；持久化业务子节点继续按 childIds 排序。
    children: [...modelParts, ...businessChildren],
  };
}

function formatSceneNodeName(node: SceneNode): string {
  const model = node.components.find((component) => component.kind === 'model');
  if (model?.kind !== 'model') return node.name;
  if (node.businessData[MODEL_INSTANCE_NAME_VERSION_KEY] === 1) {
    return node.name;
  }
  const format = props.modelAssetFormats[model.assetId];
  if (!format) return node.name;

  // 旧场景未持久化源站四位随机码，用 SceneNode ID 派生稳定后缀，避免每次渲染改名。
  let hash = 0;
  for (const character of node.id) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return formatModelInstanceName(
    node.name,
    format,
    (hash % 10_000).toString().padStart(4, '0'),
  );
}

const treeData = computed(() => {
  // document 来自 shallowRef，变更代次是原地命令更新后的显式失效信号。
  void props.changeVersion;
  return props.document.rootNodeIds.flatMap((id) => {
    const item = buildSceneItem(id, new Set());
    return item ? [item] : [];
  });
});

const matchingKeys = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase('zh-CN');
  const matches = new Set<string>();
  const visit = (item: TreeItem): boolean => {
    const childMatches = item.children.map(visit).some(Boolean);
    const selfMatches =
      !normalized || item.name.toLocaleLowerCase('zh-CN').includes(normalized);
    if (selfMatches || childMatches) matches.add(item.key);
    return selfMatches || childMatches;
  };
  treeData.value.forEach(visit);
  return matches;
});

watch([query, treeData], () => treeRef.value?.filter(query.value), {
  flush: 'post',
});

const filterNode: FilterNodeMethodFunction = (_value, item) =>
  matchingKeys.value.has((item as TreeItem).key);

function selectItem(event: MouseEvent, item: TreeItem): void {
  if (item.kind === 'model-part' && item.targetObjectId) {
    emit('select-model-part', {
      nodeId: item.ownerNodeId,
      objectId: item.id,
      targetObjectId: item.targetObjectId,
    });
    return;
  }
  const id = item.ownerNodeId;
  const additive = event.ctrlKey || event.metaKey;
  if (!additive) {
    emit('select', { ids: [id], primaryId: id });
    return;
  }
  const ids = [...props.selection.ids];
  const index = ids.indexOf(id);
  if (index >= 0) ids.splice(index, 1);
  else ids.push(id);
  emit('select', {
    ids,
    primaryId: ids.includes(id) ? id : (ids.at(-1) ?? null),
  });
}

function renameNode(node: SceneNode): void {
  const name = window.prompt('重命名节点', node.name)?.trim();
  if (name && name !== node.name) emit('rename', node.id, name);
}

function createsCycle(draggingId: string, droppingId: string): boolean {
  let current: SceneNode | undefined = props.document.nodes[droppingId];
  while (current) {
    if (current.id === draggingId) return true;
    current = current.parentId
      ? props.document.nodes[current.parentId]
      : undefined;
  }
  return false;
}

const allowDrag: AllowDragFunction = (dragging) =>
  (dragging.data as TreeItem).kind === 'scene-node';

const allowDrop: AllowDropFunction = (dragging, dropping) => {
  const draggingItem = dragging.data as TreeItem;
  const droppingItem = dropping.data as TreeItem;
  return (
    draggingItem.kind === 'scene-node' &&
    droppingItem.kind === 'scene-node' &&
    !createsCycle(draggingItem.id, droppingItem.id)
  );
};

function dropNode(
  dragging: Parameters<AllowDropFunction>[0],
  dropping: Parameters<AllowDropFunction>[1],
  type: NodeDropType,
): void {
  const draggingItem = dragging.data as TreeItem;
  const droppingItem = dropping.data as TreeItem;
  if (
    draggingItem.kind !== 'scene-node' ||
    droppingItem.kind !== 'scene-node' ||
    !droppingItem.node
  ) {
    return;
  }
  const droppingNode = droppingItem.node;
  if (type === 'inner') {
    emit(
      'reparent',
      draggingItem.id,
      droppingNode.id,
      droppingNode.childIds.length,
    );
    return;
  }
  const parentId = droppingNode.parentId;
  const siblings = parentId
    ? (props.document.nodes[parentId]?.childIds ?? [])
    : props.document.rootNodeIds;
  const droppingIndex = siblings.indexOf(droppingNode.id);
  emit(
    'reparent',
    draggingItem.id,
    parentId,
    Math.max(0, droppingIndex + (type === 'after' ? 1 : 0)),
  );
}

function sceneNodeIcon(item: TreeItem): Component {
  if (item.kind === 'model-part') return Box;
  const kinds = new Set(item.node?.components.map(({ kind }) => kind));
  if (kinds.has('model')) return Box;
  if (kinds.has('geometry')) return Grid;
  if (kinds.has('light')) return Sunny;
  if ((item.node?.components.length ?? 0) === 0) return Collection;
  return Operation;
}

/** 模型根节点的删除入口紧跟名称，展开二级结构后仍能快速定位到整模操作。 */
function isModelRoot(item: TreeItem): boolean {
  return Boolean(
    item.kind === 'scene-node' &&
    item.node?.components.some((component) => component.kind === 'model'),
  );
}
</script>

<template>
  <section class="scene-tree">
    <div class="scene-tree-search-wrap">
      <ElInput
        v-model="query"
        class="scene-tree-search"
        aria-label="搜索场景节点"
        placeholder="请输入内容名称"
        :prefix-icon="Search"
        clearable
      />
    </div>

    <button
      type="button"
      class="scene-camera"
      :class="{ 'is-selected': cameraSelected }"
      data-testid="scene-camera"
      @click="emit('select-camera')"
    >
      <CameraFilled
        class="scene-tree-element-icon scene-camera-icon"
        aria-hidden="true"
      />
      <strong>Camera</strong>
    </button>

    <ElScrollbar class="scene-tree-scroll" height="370px">
      <ElTree
        ref="treeRef"
        :data="treeData"
        node-key="key"
        default-expand-all
        draggable
        highlight-current
        :current-node-key="
          selectedModelPart
            ? `object:${selectedModelPart.nodeId}:${selectedModelPart.objectId}`
            : !cameraSelected && selection.primaryId
              ? `node:${selection.primaryId}`
              : undefined
        "
        :expand-on-click-node="false"
        :filter-node-method="filterNode"
        :allow-drag="allowDrag"
        :allow-drop="allowDrop"
        empty-text="暂无数据"
        @node-drop="dropNode"
      >
        <template #default="{ data }: { data: TreeItem }">
          <div
            class="scene-tree-row"
            :class="{
              'is-selected':
                (data.kind === 'scene-node' &&
                  !selectedModelPart &&
                  selection.ids.includes(data.id)) ||
                (data.kind === 'model-part' &&
                  selectedModelPart?.nodeId === data.ownerNodeId &&
                  selectedModelPart.objectId === data.id),
              'is-model-part': data.kind === 'model-part',
            }"
            :data-node-id="data.kind === 'scene-node' ? data.id : undefined"
            :data-object-id="data.kind === 'model-part' ? data.id : undefined"
            :data-object-type="data.objectType"
            :data-target-object-id="data.targetObjectId"
            :data-owner-node-id="data.ownerNodeId"
          >
            <span
              class="scene-tree-label"
              @click.stop="selectItem($event, data)"
              @dblclick.stop="
                data.kind === 'scene-node' && data.node
                  ? renameNode(data.node)
                  : undefined
              "
            >
              <component
                :is="sceneNodeIcon(data)"
                class="scene-tree-element-icon scene-tree-node-icon"
                aria-hidden="true"
              />
              <span class="scene-tree-name" :title="data.name">
                {{ data.name }}
              </span>
              <ElTooltip
                v-if="data.kind === 'model-part' && data.partPath"
                :content="`删除${data.name}`"
                placement="top"
              >
                <button
                  type="button"
                  class="scene-tree-action-button scene-tree-inline-delete is-danger"
                  :aria-label="`删除${data.name}`"
                  @click.stop="
                    emit('remove-model-part', {
                      nodeId: data.ownerNodeId,
                      partPath: data.partPath,
                      objectId: data.id,
                    })
                  "
                >
                  <Delete class="scene-tree-element-icon" aria-hidden="true" />
                </button>
              </ElTooltip>
              <ElTooltip
                v-if="isModelRoot(data) && data.node"
                :content="`删除${data.node.name}`"
                placement="top"
              >
                <button
                  type="button"
                  class="scene-tree-action-button scene-tree-inline-delete is-danger"
                  :aria-label="`删除${data.node.name}`"
                  @click.stop="emit('remove', data.id)"
                >
                  <Delete class="scene-tree-element-icon" aria-hidden="true" />
                </button>
              </ElTooltip>
            </span>

            <span
              v-if="data.kind === 'scene-node' && data.node"
              class="scene-tree-actions"
            >
              <ElTooltip :content="`重命名${data.node.name}`" placement="top">
                <button
                  type="button"
                  class="scene-tree-action-button"
                  :aria-label="`重命名${data.node.name}`"
                  @click.stop="renameNode(data.node)"
                >
                  <EditPen class="scene-tree-element-icon" aria-hidden="true" />
                </button>
              </ElTooltip>
              <ElTooltip :content="`复制${data.node.name}`" placement="top">
                <button
                  type="button"
                  class="scene-tree-action-button"
                  :aria-label="`复制${data.node.name}`"
                  @click.stop="emit('duplicate', data.id)"
                >
                  <CopyDocument
                    class="scene-tree-element-icon"
                    aria-hidden="true"
                  />
                </button>
              </ElTooltip>
              <ElTooltip
                :content="`${data.node.enabled ? '隐藏' : '显示'}${data.node.name}`"
                placement="top"
              >
                <button
                  type="button"
                  class="scene-tree-action-button"
                  :aria-label="`${data.node.enabled ? '隐藏' : '显示'}${data.node.name}`"
                  @click.stop="
                    emit('toggle-visible', data.id, !data.node.enabled)
                  "
                >
                  <View
                    v-if="data.node.enabled"
                    class="scene-tree-element-icon"
                    aria-hidden="true"
                  />
                  <Hide
                    v-else
                    class="scene-tree-element-icon"
                    aria-hidden="true"
                  />
                </button>
              </ElTooltip>
              <ElTooltip
                :content="`${data.node.locked ? '解锁' : '锁定'}${data.node.name}`"
                placement="top"
              >
                <button
                  type="button"
                  class="scene-tree-action-button"
                  :aria-label="`${data.node.locked ? '解锁' : '锁定'}${data.node.name}`"
                  @click.stop="
                    emit('toggle-locked', data.id, !data.node.locked)
                  "
                >
                  <Lock
                    v-if="data.node.locked"
                    class="scene-tree-element-icon"
                    aria-hidden="true"
                  />
                  <Unlock
                    v-else
                    class="scene-tree-element-icon"
                    aria-hidden="true"
                  />
                </button>
              </ElTooltip>
              <ElTooltip
                v-if="!isModelRoot(data)"
                :content="`删除${data.node.name}`"
                placement="top"
              >
                <button
                  type="button"
                  class="scene-tree-action-button is-danger"
                  :aria-label="`删除${data.node.name}`"
                  @click.stop="emit('remove', data.id)"
                >
                  <Delete class="scene-tree-element-icon" aria-hidden="true" />
                </button>
              </ElTooltip>
            </span>
          </div>
        </template>
      </ElTree>
    </ElScrollbar>
  </section>
</template>
