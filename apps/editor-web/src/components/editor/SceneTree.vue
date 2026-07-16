<script setup lang="ts">
import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import type { SelectionState } from '@digital-twin/three-engine';
import {
  ElTree,
  type AllowDropFunction,
  type FilterNodeMethodFunction,
  type NodeDropType,
} from 'element-plus';
import { computed, ref, watch } from 'vue';

interface TreeItem {
  id: string;
  node: SceneNode;
  children: TreeItem[];
}

const props = defineProps<{
  document: SceneDocument;
  selection: SelectionState;
}>();
const emit = defineEmits<{
  select: [selection: SelectionState];
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

function buildItem(id: string, visited: Set<string>): TreeItem | undefined {
  if (visited.has(id)) return undefined;
  const node = props.document.nodes[id];
  if (!node) return undefined;
  const nextVisited = new Set(visited).add(id);
  return {
    id,
    node,
    children: node.childIds.flatMap((childId) => {
      const child = buildItem(childId, nextVisited);
      return child ? [child] : [];
    }),
  };
}

const treeData = computed(() =>
  props.document.rootNodeIds.flatMap((id) => {
    const item = buildItem(id, new Set());
    return item ? [item] : [];
  }),
);

const matchingIds = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!normalized) return new Set(Object.keys(props.document.nodes));
  const matches = new Set<string>();
  for (const node of Object.values(props.document.nodes)) {
    if (!node.name.toLocaleLowerCase('zh-CN').includes(normalized)) continue;
    let current: SceneNode | undefined = node;
    while (current) {
      matches.add(current.id);
      current = current.parentId
        ? props.document.nodes[current.parentId]
        : undefined;
    }
  }
  return matches;
});

watch([query, treeData], () => treeRef.value?.filter(query.value), {
  flush: 'post',
});

const filterNode: FilterNodeMethodFunction = (_value, item) =>
  matchingIds.value.has((item as TreeItem).id);

function selectNode(event: MouseEvent, id: string): void {
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

const allowDrop: AllowDropFunction = (dragging, dropping) =>
  !createsCycle((dragging.data as TreeItem).id, (dropping.data as TreeItem).id);

function dropNode(
  dragging: Parameters<AllowDropFunction>[0],
  dropping: Parameters<AllowDropFunction>[1],
  type: NodeDropType,
): void {
  const draggingItem = dragging.data as TreeItem;
  const droppingItem = dropping.data as TreeItem;
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
</script>

<template>
  <section class="scene-tree">
    <input
      v-model="query"
      class="scene-tree-search"
      type="search"
      aria-label="搜索场景节点"
      placeholder="搜索场景节点"
    />
    <div class="scene-tree-toolbar">
      <span>{{ selection.ids.length }} 个已选</span>
      <button
        type="button"
        aria-label="组合选中节点"
        :disabled="selection.ids.length === 0"
        @click="emit('group', [...selection.ids])"
      >
        组合
      </button>
    </div>
    <ElTree
      ref="treeRef"
      :data="treeData"
      node-key="id"
      default-expand-all
      draggable
      :expand-on-click-node="false"
      :filter-node-method="filterNode"
      :allow-drop="allowDrop"
      @node-drop="dropNode"
    >
      <template #default="{ data }: { data: TreeItem }">
        <div
          class="scene-tree-row"
          :class="{ 'is-selected': selection.ids.includes(data.id) }"
          :data-node-id="data.id"
        >
          <span
            class="scene-tree-label"
            :title="data.node.name"
            @click.stop="selectNode($event, data.id)"
            @dblclick.stop="renameNode(data.node)"
          >
            {{ data.node.name }}
          </span>
          <span class="scene-tree-actions">
            <button
              type="button"
              :aria-label="`重命名${data.node.name}`"
              @click.stop="renameNode(data.node)"
            >
              ✎
            </button>
            <button
              type="button"
              :aria-label="`复制${data.node.name}`"
              @click.stop="emit('duplicate', data.id)"
            >
              ⧉
            </button>
            <button
              type="button"
              :aria-label="`${data.node.enabled ? '隐藏' : '显示'}${data.node.name}`"
              @click.stop="emit('toggle-visible', data.id, !data.node.enabled)"
            >
              {{ data.node.enabled ? '◉' : '○' }}
            </button>
            <button
              type="button"
              :aria-label="`${data.node.locked ? '解锁' : '锁定'}${data.node.name}`"
              @click.stop="emit('toggle-locked', data.id, !data.node.locked)"
            >
              {{ data.node.locked ? '🔒' : '🔓' }}
            </button>
            <button
              type="button"
              :aria-label="`删除${data.node.name}`"
              @click.stop="emit('remove', data.id)"
            >
              ×
            </button>
          </span>
        </div>
      </template>
    </ElTree>
    <p v-if="treeData.length === 0" class="empty-panel">当前场景暂无节点</p>
  </section>
</template>
