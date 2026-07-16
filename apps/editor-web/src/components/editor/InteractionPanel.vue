<script setup lang="ts">
import {
  interactionDefinitionSchema,
  type DataSourceDefinition,
  type InteractionDefinition,
  type SceneNode,
  type TriggerDefinition,
} from '@digital-twin/scene-schema';
import { computed, ref, shallowRef, watch } from 'vue';
import type { RuntimeConfigPatch } from '@digital-twin/editor-core';

const props = defineProps<{
  nodes: SceneNode[];
  interactions: InteractionDefinition[];
  dataSources: DataSourceDefinition[];
}>();

const emit = defineEmits<{
  commit: [patch: RuntimeConfigPatch];
}>();

// 交互条件是递归树，shallowRef 避免 Vue 类型系统对整棵树执行无限深解包。
const items = shallowRef<InteractionDefinition[]>([]);
const selectedId = ref('');
const triggerType = ref<TriggerDefinition['type']>('click');
const conditionsJson = ref('');
const actionsJson = ref('');
const errorMessage = ref('');

// Vue props/ref 内部可能是 Proxy；运行时配置是纯 JSON，用序列化复制跨越响应式边界最稳定。
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const selected = computed(() =>
  items.value.find((item) => item.id === selectedId.value),
);

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function syncDraft(): void {
  const interaction = selected.value;
  if (!interaction) {
    conditionsJson.value = '';
    actionsJson.value = '';
    return;
  }
  triggerType.value = interaction.trigger.type;
  conditionsJson.value = JSON.stringify(interaction.conditions, null, 2);
  actionsJson.value = JSON.stringify(interaction.actions, null, 2);
  errorMessage.value = '';
}

watch(
  () => props.interactions,
  (interactions) => {
    items.value = cloneJson(interactions);
    if (!items.value.some(({ id }) => id === selectedId.value)) {
      selectedId.value = items.value[0]?.id ?? '';
    }
    syncDraft();
  },
  { immediate: true },
);

watch(selectedId, syncDraft);

function triggerFor(type: TriggerDefinition['type']): TriggerDefinition {
  switch (type) {
    case 'timer':
      return { type, delayMs: 1_000 };
    case 'websocket':
      return {
        type,
        dataSourceId: props.dataSources[0]?.id ?? 'missing-data-source',
      };
    case 'variable-change':
      return { type, key: 'variable' };
    case 'animation-end':
      return {
        type,
        nodeId: selected.value?.sourceNodeId ?? props.nodes[0]!.id,
      };
    case 'region-enter':
    case 'region-leave':
      return {
        type,
        regionNodeId: selected.value?.sourceNodeId ?? props.nodes[0]!.id,
      };
    default:
      return { type };
  }
}

function addInteraction(): void {
  const node = props.nodes[0];
  if (!node) {
    errorMessage.value = '请先在场景中添加节点';
    return;
  }
  const interaction: InteractionDefinition = {
    id: createId('interaction'),
    name: '单击事件',
    enabled: true,
    sourceNodeId: node.id,
    trigger: { type: 'click' },
    conditions: { logic: 'all', conditions: [] },
    execution: 'sequential',
    actions: [{ type: 'toggle-visibility', nodeId: node.id }],
  };
  items.value = [...items.value, interaction];
  selectedId.value = interaction.id;
  emit('commit', { interactions: cloneJson(items.value) });
}

function applyInteraction(): void {
  const interaction = selected.value;
  if (!interaction) return;
  let conditions: unknown;
  let actions: unknown;
  try {
    conditions = JSON.parse(conditionsJson.value) as unknown;
  } catch {
    errorMessage.value = '条件 JSON 格式错误';
    return;
  }
  try {
    actions = JSON.parse(actionsJson.value) as unknown;
  } catch {
    errorMessage.value = '动作 JSON 格式错误';
    return;
  }
  const parsed = interactionDefinitionSchema.safeParse({
    ...interaction,
    trigger: triggerFor(triggerType.value),
    conditions,
    actions,
  });
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? '交互配置无效';
    return;
  }
  const index = items.value.findIndex(({ id }) => id === interaction.id);
  const nextItems = [...items.value];
  nextItems[index] = parsed.data;
  items.value = nextItems;
  errorMessage.value = '';
  emit('commit', { interactions: cloneJson(items.value) });
}

function removeInteraction(): void {
  const index = items.value.findIndex(({ id }) => id === selectedId.value);
  if (index < 0) return;
  items.value = items.value.filter((_, itemIndex) => itemIndex !== index);
  selectedId.value = items.value[0]?.id ?? '';
  emit('commit', { interactions: cloneJson(items.value) });
}
</script>

<template>
  <section class="runtime-config-panel interaction-panel">
    <div class="runtime-config-toolbar">
      <strong>交互事件</strong>
      <button
        type="button"
        data-testid="add-interaction"
        @click="addInteraction"
      >
        + 新建
      </button>
    </div>
    <div v-if="items.length" class="runtime-config-list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        :class="{ active: item.id === selectedId }"
        @click="selectedId = item.id"
      >
        {{ item.name }}
      </button>
    </div>
    <div v-if="selected" class="runtime-config-form">
      <label>名称<input v-model.trim="selected.name" /></label>
      <label>
        来源节点
        <select v-model="selected.sourceNodeId">
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>
      </label>
      <label>
        触发器
        <select v-model="triggerType">
          <option value="scene-load">场景加载</option>
          <option value="click">单击</option>
          <option value="double-click">双击</option>
          <option value="pointer-enter">鼠标进入</option>
          <option value="pointer-leave">鼠标离开</option>
          <option value="timer">定时</option>
          <option value="websocket">WebSocket</option>
          <option value="variable-change">变量变化</option>
        </select>
      </label>
      <label>
        执行方式
        <select v-model="selected.execution">
          <option value="sequential">串行</option>
          <option value="parallel">并行</option>
        </select>
      </label>
      <label>
        条件 JSON
        <textarea v-model="conditionsJson" rows="6" />
      </label>
      <label>
        动作 JSON
        <textarea
          v-model="actionsJson"
          rows="9"
          data-testid="interaction-actions-json"
        />
      </label>
      <p v-if="errorMessage" class="field-error">{{ errorMessage }}</p>
      <div class="runtime-config-actions">
        <button type="button" @click="removeInteraction">删除</button>
        <button
          type="button"
          data-testid="apply-interaction"
          @click="applyInteraction"
        >
          应用
        </button>
      </div>
    </div>
    <div v-else class="empty-panel">选择节点后新建交互事件</div>
  </section>
</template>
