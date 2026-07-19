<script setup lang="ts">
import {
  SceneRuntime,
  type RuntimeDiagnostic,
  type WebSocketLike,
} from '@digital-twin/runtime-core';
import type { SceneDocument } from '@digital-twin/scene-schema';
import {
  RuntimeThreeEngine,
  type AssetResolver,
  type RuntimeNavigationState,
} from '@digital-twin/three-engine';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import RuntimeLoadingOverlay from './components/RuntimeLoadingOverlay.vue';
import RuntimePreviewToolbar from './components/RuntimePreviewToolbar.vue';
import RuntimeRoamingStatus from './components/RuntimeRoamingStatus.vue';

const props = defineProps<{
  document: SceneDocument;
  resolver: AssetResolver;
  mode: 'preview' | 'runtime';
}>();

const container = ref<HTMLDivElement>();
const errorMessage = ref('');
const ready = ref(false);
const objectCount = ref(0);
const visibleMeshCount = ref(0);
const socketStatus = ref('idle');
const lastTaskCode = ref('');
const diagnostics = shallowRef<RuntimeDiagnostic[]>([]);
const navigation = ref<RuntimeNavigationState>({
  mode: 'orbit',
  paths: [],
  activePathId: null,
});
const loadingText = ref('正在初始化三维引擎...');
const engine = new RuntimeThreeEngine();
let runtime: SceneRuntime | undefined;
let initialized = false;
let disposed = false;
let loadGeneration = 0;
let unsubscribeNavigation: (() => void) | undefined;

const showDiagnostics = computed(
  () =>
    props.mode === 'preview' ||
    new URLSearchParams(window.location.search).get('debug') === '1',
);

function appendDiagnostic(diagnostic: RuntimeDiagnostic): void {
  // 调试记录限制长度，长时间运行的 Socket 场景不会无限占用浏览器内存。
  diagnostics.value = [...diagnostics.value.slice(-99), diagnostic];
}

function createSocket(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

function syncRuntimeStats(): void {
  const stats = engine.getStats();
  objectCount.value = stats.objectCount;
  // SceneStats.meshCount 会过滤被隐藏的祖先节点，可直接用于验收交互显隐结果。
  visibleMeshCount.value = stats.meshCount;
}

async function loadRuntime(): Promise<void> {
  if (!initialized || disposed) return;
  const generation = ++loadGeneration;
  ready.value = false;
  loadingText.value = '正在加载场景资源...';
  errorMessage.value = '';
  runtime?.dispose();
  runtime = undefined;
  try {
    await engine.loadDocument(props.document, props.resolver);
    if (disposed || generation !== loadGeneration) return;
    // 预览首次打开需要保证归一化模型落在可视范围；用户后续可继续用 OrbitControls 调整视角。
    if (props.mode === 'preview') engine.fitDocumentCamera?.();
    const nextRuntime = new SceneRuntime({
      host: engine.createHost(),
      createSocket,
      onDiagnostic: appendDiagnostic,
      onSocketStatus: (_dataSourceId, status) => {
        socketStatus.value = status;
      },
      onSocketTask: (execution) => {
        lastTaskCode.value = execution.taskCode;
        syncRuntimeStats();
      },
      onInteractionSettled: syncRuntimeStats,
    });
    nextRuntime.load(props.document);
    nextRuntime.start();
    runtime = nextRuntime;
    syncRuntimeStats();
    ready.value = true;
    loadingText.value = '';
  } catch (error) {
    if (disposed || generation !== loadGeneration) return;
    errorMessage.value =
      error instanceof Error ? error.message : '三维场景初始化失败';
  }
}

function toggleFirstPerson(): void {
  if (navigation.value.mode === 'first-person') engine.exitFirstPerson();
  else engine.requestFirstPerson();
}

function playCameraRoaming(pathId: string): void {
  engine.playCameraRoaming(pathId);
}

function onRuntimeMessage(event: MessageEvent): void {
  const payload = event.data as
    | {
        type?: string;
        dataSourceId?: string;
        payload?: unknown;
      }
    | undefined;
  if (
    payload?.type !== 'digital-twin:socket-message' ||
    typeof payload.dataSourceId !== 'string'
  ) {
    return;
  }
  if (event.source !== window.opener && event.source !== window.parent) return;
  void runtime?.injectSocketMessage(payload.dataSourceId, payload.payload);
}

onMounted(async () => {
  if (!container.value) return;
  try {
    await engine.initialize(container.value);
    if (disposed) return;
    initialized = true;
    unsubscribeNavigation = engine.subscribeNavigation((state) => {
      navigation.value = state;
    });
    window.addEventListener('message', onRuntimeMessage);
    await loadRuntime();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '三维场景初始化失败';
  }
});

watch(
  () => [props.document, props.resolver] as const,
  () => void loadRuntime(),
);

onBeforeUnmount(() => {
  disposed = true;
  loadGeneration += 1;
  window.removeEventListener('message', onRuntimeMessage);
  // 动作和 Socket 必须先停，避免销毁 Three 对象后仍有晚到任务访问 Host。
  runtime?.dispose();
  runtime = undefined;
  unsubscribeNavigation?.();
  unsubscribeNavigation = undefined;
  engine.dispose();
});

defineExpose({
  injectSocketMessage(dataSourceId: string, payload: unknown) {
    return runtime?.injectSocketMessage(dataSourceId, payload);
  },
});
</script>

<template>
  <div
    ref="container"
    class="runtime-canvas"
    data-testid="runtime-canvas"
    :data-runtime-ready="String(ready)"
    :data-runtime-mode="mode"
    :data-navigation-mode="navigation.mode"
    :data-scene-object-count="String(objectCount)"
    :data-visible-mesh-count="String(visibleMeshCount)"
    :data-socket-status="socketStatus"
    :data-last-task-code="lastTaskCode"
  >
    <div v-if="errorMessage" class="runtime-error">{{ errorMessage }}</div>
    <RuntimePreviewToolbar
      v-if="mode === 'preview' && ready"
      :state="navigation"
      @reset="engine.resetCamera()"
      @toggle-first-person="toggleFirstPerson"
      @play="playCameraRoaming"
    />
    <RuntimeRoamingStatus
      v-if="mode === 'preview' && navigation.mode === 'roaming'"
      @stop="engine.stopCameraRoaming()"
    />
    <RuntimeLoadingOverlay v-if="!ready && !errorMessage" :text="loadingText" />
    <details
      v-if="showDiagnostics && diagnostics.length > 0"
      class="runtime-diagnostics"
    >
      <summary>运行诊断（{{ diagnostics.length }}）</summary>
      <ol>
        <li v-for="item in diagnostics" :key="item.timestamp">
          [{{ item.source }}] {{ item.message }}
        </li>
      </ol>
    </details>
  </div>
</template>

<style scoped>
.runtime-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* setPixelRatio 会把 drawing buffer 放大到 DPR 倍；CSS 尺寸必须仍锁定在容器内，
 * 否则高 DPI 屏幕会把 2560×1440 的画布按物理尺寸铺出 1280×720 容器，
 * 造成模型只出现在右下角，用户误以为资源没有加载。 */
.runtime-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.runtime-error {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  padding: 12px 18px;
  color: #fecaca;
  background: rgb(127 29 29 / 80%);
  border-radius: 6px;
  transform: translate(-50%, -50%);
}

.runtime-diagnostics {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 2;
  width: min(420px, calc(100% - 24px));
  max-height: 38%;
  padding: 8px 10px;
  overflow: auto;
  color: #cbd5e1;
  font:
    11px/1.5 ui-monospace,
    monospace;
  background: rgb(7 10 19 / 88%);
  border: 1px solid #334155;
  border-radius: 5px;
}

.runtime-diagnostics ol {
  margin: 8px 0 0;
  padding-left: 18px;
}
</style>
