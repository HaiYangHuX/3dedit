<script setup lang="ts">
import type { RuntimeConfigPatch } from '@digital-twin/editor-core';
import {
  dataSourceDefinitionSchema,
  socketTaskDefinitionSchema,
  type DataSourceDefinition,
  type SceneNode,
  type SocketTaskDefinition,
} from '@digital-twin/scene-schema';
import { computed, ref, shallowRef, watch } from 'vue';

const props = defineProps<{
  nodes: SceneNode[];
  dataSources: DataSourceDefinition[];
  socketTasks: SocketTaskDefinition[];
}>();

const emit = defineEmits<{
  commit: [patch: RuntimeConfigPatch];
  simulate: [dataSourceId: string, payload: unknown];
}>();

// heartbeatPayload/taskData 含递归 JSON，避免 Vue 对其做无限深类型解包。
const sources = shallowRef<DataSourceDefinition[]>([]);
const tasks = shallowRef<SocketTaskDefinition[]>([]);
const selectedSourceId = ref('');
const selectedTaskId = ref('');
const taskDataJson = ref('');
const simulateJson = ref(
  JSON.stringify(
    {
      taskCode: 'device-position',
      taskTime: 500,
      taskData: { x: 1, y: 0, z: 1 },
    },
    null,
    2,
  ),
);
const errorMessage = ref('');

// 表单项受 Vue 深层代理，提交命令前必须复制为可 structuredClone 的普通 JSON。
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const selectedSource = computed(() =>
  sources.value.find(({ id }) => id === selectedSourceId.value),
);
const selectedTask = computed(() =>
  tasks.value.find(({ id }) => id === selectedTaskId.value),
);

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function syncProps(): void {
  sources.value = cloneJson(props.dataSources);
  tasks.value = cloneJson(props.socketTasks);
  selectedSourceId.value = sources.value[0]?.id ?? '';
  selectedTaskId.value = tasks.value[0]?.id ?? '';
  taskDataJson.value = selectedTask.value
    ? JSON.stringify(selectedTask.value.taskData, null, 2)
    : '';
}

watch(() => [props.dataSources, props.socketTasks], syncProps, {
  immediate: true,
});
watch(selectedTaskId, () => {
  taskDataJson.value = selectedTask.value
    ? JSON.stringify(selectedTask.value.taskData, null, 2)
    : '';
});

function commit(): void {
  emit('commit', {
    dataSources: cloneJson(sources.value),
    socketTasks: cloneJson(tasks.value),
  });
}

function addSource(): void {
  const source: DataSourceDefinition = {
    id: createId('socket'),
    name: 'WebSocket 数据源',
    type: 'websocket',
    url: 'ws://127.0.0.1:18080',
    enabled: true,
    autoConnect: true,
    heartbeatMs: 10_000,
    heartbeatPayload: { type: 'ping' },
    reconnectLimit: 5,
    reconnectBaseDelayMs: 1_000,
  };
  sources.value = [...sources.value, source];
  selectedSourceId.value = source.id;
  commit();
}

function applySource(): void {
  const source = selectedSource.value;
  if (!source) return;
  const parsed = dataSourceDefinitionSchema.safeParse(source);
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? '数据源配置无效';
    return;
  }
  Object.assign(source, parsed.data);
  errorMessage.value = '';
  commit();
}

function removeSource(): void {
  const sourceId = selectedSourceId.value;
  sources.value = sources.value.filter(({ id }) => id !== sourceId);
  tasks.value = tasks.value.filter(
    ({ dataSourceId }) => dataSourceId !== sourceId,
  );
  selectedSourceId.value = sources.value[0]?.id ?? '';
  selectedTaskId.value = tasks.value[0]?.id ?? '';
  commit();
}

function addTask(): void {
  const source = selectedSource.value ?? sources.value[0];
  const node = props.nodes[0];
  if (!source || !node) {
    errorMessage.value = '请先创建数据源并添加场景节点';
    return;
  }
  const task: SocketTaskDefinition = {
    id: createId('task'),
    dataSourceId: source.id,
    taskCode: `device-position-${tasks.value.length + 1}`,
    taskType: 'ModelPosition',
    targetNodeId: node.id,
    taskTime: 500,
    taskData: { x: 0, y: 0, z: 0 },
  };
  tasks.value = [...tasks.value, task];
  selectedTaskId.value = task.id;
  taskDataJson.value = JSON.stringify(task.taskData, null, 2);
  commit();
}

function applyTask(): void {
  const task = selectedTask.value;
  if (!task) return;
  let taskData: unknown;
  try {
    taskData = JSON.parse(taskDataJson.value) as unknown;
  } catch {
    errorMessage.value = '任务数据 JSON 格式错误';
    return;
  }
  const parsed = socketTaskDefinitionSchema.safeParse({ ...task, taskData });
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? 'Socket 任务无效';
    return;
  }
  if (
    tasks.value.some(
      (candidate) =>
        candidate.id !== task.id && candidate.taskCode === parsed.data.taskCode,
    )
  ) {
    errorMessage.value = 'taskCode 不能重复';
    return;
  }
  Object.assign(task, parsed.data);
  errorMessage.value = '';
  commit();
}

function removeTask(): void {
  tasks.value = tasks.value.filter(({ id }) => id !== selectedTaskId.value);
  selectedTaskId.value = tasks.value[0]?.id ?? '';
  commit();
}

function simulate(): void {
  let payload: unknown;
  try {
    payload = JSON.parse(simulateJson.value) as unknown;
  } catch {
    errorMessage.value = '模拟消息 JSON 格式错误';
    return;
  }
  const sourceId = selectedSourceId.value || sources.value[0]?.id;
  if (!sourceId) {
    errorMessage.value = '请先创建数据源';
    return;
  }
  errorMessage.value = '';
  emit('simulate', sourceId, payload);
}
</script>

<template>
  <section class="runtime-config-panel socket-task-panel">
    <div class="runtime-config-toolbar">
      <strong>WebSocket 数据源</strong>
      <button type="button" data-testid="add-data-source" @click="addSource">
        + 数据源
      </button>
    </div>
    <div class="runtime-config-list">
      <button
        v-for="source in sources"
        :key="source.id"
        type="button"
        :class="{ active: source.id === selectedSourceId }"
        @click="selectedSourceId = source.id"
      >
        {{ source.name }}
      </button>
    </div>
    <div v-if="selectedSource" class="runtime-config-form">
      <label>名称<input v-model.trim="selectedSource.name" /></label>
      <label>URL<input v-model.trim="selectedSource.url" /></label>
      <label
        >心跳 ms<input
          v-model.number="selectedSource.heartbeatMs"
          type="number"
      /></label>
      <label
        >重连次数<input
          v-model.number="selectedSource.reconnectLimit"
          type="number"
      /></label>
      <label class="runtime-inline-check">
        <input v-model="selectedSource.enabled" type="checkbox" />启用
      </label>
      <div class="runtime-config-actions">
        <button type="button" @click="removeSource">删除数据源</button>
        <button type="button" @click="applySource">应用数据源</button>
      </div>
    </div>

    <div class="runtime-config-toolbar runtime-config-toolbar--section">
      <strong>任务映射</strong>
      <button type="button" data-testid="add-socket-task" @click="addTask">
        + 任务
      </button>
    </div>
    <div class="runtime-config-list">
      <button
        v-for="task in tasks"
        :key="task.id"
        type="button"
        :class="{ active: task.id === selectedTaskId }"
        @click="selectedTaskId = task.id"
      >
        {{ task.taskCode }}
      </button>
    </div>
    <div v-if="selectedTask" class="runtime-config-form">
      <label>taskCode<input v-model.trim="selectedTask.taskCode" /></label>
      <label>
        taskType
        <select v-model="selectedTask.taskType">
          <option value="ModelPosition">位置</option>
          <option value="ModelRotation">旋转</option>
          <option value="ModelScale">缩放</option>
          <option value="ModelVisible">显隐</option>
          <option value="ModelColor">颜色</option>
          <option value="TextUpdate">文本</option>
          <option value="ChartUpdate">图表</option>
          <option value="VideoControl">视频</option>
          <option value="AnimationControl">动画</option>
          <option value="CameraMove">相机</option>
        </select>
      </label>
      <label>
        目标节点
        <select v-model="selectedTask.targetNodeId">
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>
      </label>
      <label
        >持续 ms<input v-model.number="selectedTask.taskTime" type="number"
      /></label>
      <label>taskData JSON<textarea v-model="taskDataJson" rows="6" /></label>
      <div class="runtime-config-actions">
        <button type="button" @click="removeTask">删除任务</button>
        <button type="button" @click="applyTask">应用任务</button>
      </div>
    </div>

    <div class="runtime-config-toolbar runtime-config-toolbar--section">
      <strong>模拟消息</strong>
    </div>
    <textarea
      v-model="simulateJson"
      rows="7"
      data-testid="simulate-message-json"
    />
    <button
      type="button"
      class="runtime-primary-button"
      data-testid="simulate-socket-message"
      @click="simulate"
    >
      发送到预览
    </button>
    <p v-if="errorMessage" class="field-error">{{ errorMessage }}</p>
  </section>
</template>
