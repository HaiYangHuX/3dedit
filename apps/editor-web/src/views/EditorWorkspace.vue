<script setup lang="ts">
import type { Asset, PublicationDetail } from '@digital-twin/api-contracts';
import type { RuntimeConfigPatch } from '@digital-twin/editor-core';
import type {
  CameraOrientation,
  CameraView,
  RenderStats,
  SceneStats,
  SelectionState,
  TransformCommit,
} from '@digital-twin/three-engine';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EditorCanvas from '../components/EditorCanvas.vue';
import AssetLibraryPanel from '../components/AssetLibraryPanel.vue';
import AssetPalette from '../components/editor/AssetPalette.vue';
import EditorTopBar from '../components/editor/EditorTopBar.vue';
import NodeInspector from '../components/editor/NodeInspector.vue';
import InteractionPanel from '../components/editor/InteractionPanel.vue';
import RuntimeDiagnostics from '../components/editor/RuntimeDiagnostics.vue';
import SceneSettingsInspector from '../components/editor/SceneSettingsInspector.vue';
import SceneTree from '../components/editor/SceneTree.vue';
import SocketTaskPanel from '../components/editor/SocketTaskPanel.vue';
import ViewportGizmo from '../components/editor/ViewportGizmo.vue';
import ViewportStats from '../components/editor/ViewportStats.vue';
import ViewportToolbar from '../components/editor/ViewportToolbar.vue';
import {
  useEditorCommands,
  type EditorCanvasBridge,
} from '../editor/useEditorCommands';
import { useDocumentStore, type SaveState } from '../stores/document';
import { useAssetStore } from '../stores/asset';
import { useSelectionStore } from '../stores/selection';
import { publicationApi } from '../api/publications';

const props = withDefaults(
  defineProps<{ projectId?: string; sceneId?: string }>(),
  { projectId: 'local-project', sceneId: 'local-scene' },
);
const store = useDocumentStore();
const { document, documentChangeVersion, saveState, error, canUndo, canRedo } =
  storeToRefs(store);
const selectionStore = useSelectionStore();
const { ids: selectedIds, primaryId } = storeToRefs(selectionStore);
const canvas = ref<EditorCanvasBridge>();
const viewportShell = ref<HTMLElement>();
const assetStore = useAssetStore();
const { assets } = storeToRefs(assetStore);
const inspectorTab = ref<'scene' | 'interaction' | 'socket' | 'settings'>(
  'scene',
);
const assetCategory = ref<
  'model' | 'geometry' | 'light' | 'chart' | 'text' | 'video' | 'shader'
>('model');
const runtimeNodes = computed(() => Object.values(document.value.nodes));
const runtimeDiagnostics = ref<string[]>([]);
const publication = ref<PublicationDetail>();
const publishing = ref(false);
const transformMode = ref<'translate' | 'rotate' | 'scale'>('translate');
const transformSpace = ref<'local' | 'world'>('world');
const cameraOrientation = ref<CameraOrientation>({
  quaternion: [0, 0, 0, 1],
});
const renderStats = ref<RenderStats>({ fps: 0, drawCalls: 0 });
const isFullscreen = ref(false);
let previewWindow: Window | null = null;
const runtimeOrigin = (
  import.meta.env.VITE_RUNTIME_ORIGIN ?? 'http://127.0.0.1:5174'
).replace(/\/$/, '');

function showEditorError(reason: unknown, fallback = '编辑操作执行失败'): void {
  ElMessage.error(reason instanceof Error ? reason.message : fallback);
}

const commands = useEditorCommands(canvas, {
  onError: showEditorError,
});
const stats = ref<SceneStats>({
  objectCount: 0,
  meshCount: 0,
  vertexCount: 0,
  faceCount: 0,
});
const selection = computed<SelectionState>(() => ({
  ids: selectedIds.value,
  primaryId: primaryId.value,
}));
const selectedNode = computed(() =>
  primaryId.value ? document.value.nodes[primaryId.value] : undefined,
);
const textureAssets = computed(() =>
  assets.value.filter(
    (asset) =>
      asset.status === 'ready' &&
      (asset.kind === 'image' || asset.kind === 'texture'),
  ),
);

const saveStateLabel: Record<SaveState, string> = {
  idle: '尚未加载',
  loading: '加载中',
  saved: '已保存',
  dirty: '有未保存更改',
  saving: '保存中',
  conflict: '保存冲突',
  error: '保存失败',
};
const stateLabel = computed(() => saveStateLabel[saveState.value]);

watch(
  () => props.sceneId,
  (sceneId) => {
    void Promise.resolve(store.loadScene(sceneId)).catch(() => {
      // 状态栏展示详细错误，保留引擎视口以便用户重试。
    });
  },
  { immediate: true },
);

function syncFullscreenState(): void {
  isFullscreen.value =
    globalThis.document.fullscreenElement === viewportShell.value;
}

onMounted(() => {
  window.addEventListener('keydown', commands.handleKeydown);
  globalThis.document.addEventListener('fullscreenchange', syncFullscreenState);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', commands.handleKeydown);
  globalThis.document.removeEventListener(
    'fullscreenchange',
    syncFullscreenState,
  );
  store.disposeAutoSave();
});

async function saveDocument(): Promise<void> {
  try {
    await store.save();
    ElMessage.success('场景已保存');
  } catch {
    ElMessage.error(error.value || '场景保存失败');
  }
}

function reloadScene(): void {
  void store.loadScene(props.sceneId).catch(() => undefined);
}

function activateAsset(asset: Asset): void {
  void commands
    .addAssetNode(asset, [0, 0, 0])
    .catch((reason) => showEditorError(reason, '添加模型失败'));
}

interface AssetDropPayload {
  assetId: string;
  name: string;
  position: [number, number, number];
}

function dropAsset(payload: AssetDropPayload): void {
  void commands
    .addAssetNode({ id: payload.assetId, name: payload.name }, payload.position)
    .catch((reason) => showEditorError(reason, '添加模型失败'));
}

function commitTransform(commit: TransformCommit): void {
  void commands
    .commitTransform(commit)
    .catch((reason) => showEditorError(reason, '保存变换失败'));
}

function undoCommand(): void {
  void commands.undo().catch(showEditorError);
}

function redoCommand(): void {
  void commands.redo().catch(showEditorError);
}

function runCommand(operation: Promise<unknown>): void {
  void operation.catch(showEditorError);
}

function changeSelection(selection: SelectionState): void {
  commands.select(selection);
}

function changeStats(value: SceneStats): void {
  stats.value = value;
}

function changeCameraOrientation(value: CameraOrientation): void {
  cameraOrientation.value = value;
}

function changeRenderStats(value: RenderStats): void {
  renderStats.value = value;
}

function changeTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
  transformMode.value = mode;
  commands.setTransformMode(mode);
}

function changeTransformSpace(space: 'local' | 'world'): void {
  transformSpace.value = space;
  canvas.value?.setTransformSpace?.(space);
}

function changeCameraView(view: CameraView): void {
  commands.setCameraView(view);
}

async function downloadScreenshot(): Promise<void> {
  try {
    const blob = await commands.captureScreenshot();
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = `${document.value.name || 'scene'}-${Date.now()}.png`;
    link.click();
    URL.revokeObjectURL(url);
    ElMessage.success('视口截图已下载');
  } catch (reason) {
    showEditorError(reason, '视口截图失败');
  }
}

async function toggleViewportFullscreen(): Promise<void> {
  try {
    if (globalThis.document.fullscreenElement === viewportShell.value) {
      await globalThis.document.exitFullscreen();
    } else if (viewportShell.value) {
      await viewportShell.value.requestFullscreen();
    }
  } catch (reason) {
    showEditorError(reason, '无法切换视口全屏');
  }
}

async function ensureRuntimeDocumentSaved(): Promise<void> {
  if (saveState.value === 'dirty' || saveState.value === 'error') {
    await store.save();
  }
}

async function openPreview(): Promise<void> {
  try {
    await ensureRuntimeDocumentSaved();
    const url = `${runtimeOrigin}/preview/${encodeURIComponent(props.sceneId)}`;
    previewWindow = window.open(url, 'digital-twin-preview');
    if (!previewWindow) throw new Error('浏览器阻止了预览窗口');
    runtimeDiagnostics.value.push('已打开当前草稿预览');
  } catch (reason) {
    showEditorError(reason, '打开预览失败');
  }
}

async function publishScene(): Promise<void> {
  publishing.value = true;
  try {
    await ensureRuntimeDocumentSaved();
    publication.value = await publicationApi.publish(props.projectId, {
      sceneId: props.sceneId,
    });
    runtimeDiagnostics.value.push('当前场景已原子发布');
    ElMessage.success('发布成功');
  } catch (reason) {
    showEditorError(reason, '发布失败，已有线上内容未改变');
  } finally {
    publishing.value = false;
  }
}

function commitRuntimeConfig(patch: RuntimeConfigPatch): void {
  runCommand(commands.updateRuntimeConfig(patch));
}

function simulateSocket(dataSourceId: string, payload: unknown): void {
  if (!previewWindow || previewWindow.closed) {
    runtimeDiagnostics.value.push('请先打开预览，再发送模拟消息');
    ElMessage.warning('请先打开预览窗口');
    return;
  }
  previewWindow.postMessage(
    {
      type: 'digital-twin:socket-message',
      dataSourceId,
      payload,
    },
    new URL(runtimeOrigin).origin,
  );
  runtimeDiagnostics.value.push(`已发送模拟消息：${dataSourceId}`);
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  ElMessage.success('已复制');
}
</script>

<template>
  <main class="editor-workspace">
    <EditorTopBar
      :scene-name="document.name"
      :save-state-label="stateLabel"
      :save-state-error="saveState === 'conflict' || saveState === 'error'"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :saving="saveState === 'saving'"
      :publishing="publishing"
      :show-reload="saveState === 'conflict'"
      @undo="undoCommand"
      @redo="redoCommand"
      @save="saveDocument"
      @reload="reloadScene"
      @preview="openPreview"
      @publish="publishScene"
    />

    <AssetPalette v-model:active="assetCategory">
      <AssetLibraryPanel
        v-if="assetCategory === 'model'"
        @activate="activateAsset"
      />
      <div v-else-if="assetCategory === 'geometry'" class="element-palette">
        <button
          v-for="item in [
            ['box', '立方体'],
            ['sphere', '球体'],
            ['plane', '平面'],
            ['cylinder', '圆柱体'],
          ] as const"
          :key="item[0]"
          type="button"
          :data-testid="`add-geometry-${item[0]}`"
          @click="runCommand(commands.addGeometry(item[0]))"
        >
          <span class="element-palette-icon">{{ item[1].slice(0, 1) }}</span>
          {{ item[1] }}
        </button>
      </div>
      <div v-else-if="assetCategory === 'light'" class="element-palette">
        <button
          v-for="item in [
            ['ambient', '环境光'],
            ['directional', '平行光'],
            ['hemisphere', '半球光'],
            ['point', '点光源'],
            ['spot', '聚光灯'],
          ] as const"
          :key="item[0]"
          type="button"
          :data-testid="`add-light-${item[0]}`"
          @click="runCommand(commands.addLight(item[0]))"
        >
          <span class="element-palette-icon">✦</span>
          {{ item[1] }}
        </button>
      </div>
      <div v-else class="empty-panel">
        {{
          {
            chart: '图表组件将在低代码组件阶段接入',
            text: '文本与标注组件将在低代码组件阶段接入',
            video: '视频组件将在媒体资源阶段接入',
            shader: 'Shader 组件将在特效阶段接入',
          }[assetCategory]
        }}
      </div>
    </AssetPalette>

    <section ref="viewportShell" class="viewport-shell">
      <ViewportToolbar
        :mode="transformMode"
        :space="transformSpace"
        :grid-visible="document.settings.gridVisible"
        :is-fullscreen="isFullscreen"
        @mode="changeTransformMode"
        @space="changeTransformSpace"
        @grid="
          (gridVisible) =>
            runCommand(commands.updateSceneSettings({ gridVisible }))
        "
        @focus="commands.focusSelection"
        @reset="commands.resetCamera"
        @screenshot="downloadScreenshot"
        @fullscreen="toggleViewportFullscreen"
      />
      <EditorCanvas
        ref="canvas"
        :document="document"
        @select="changeSelection"
        @transform-commit="commitTransform"
        @asset-drop="dropAsset"
        @stats-change="changeStats"
        @camera-change="changeCameraOrientation"
        @render-stats-change="changeRenderStats"
      />
      <ViewportStats :scene="stats" :render="renderStats" />
      <ViewportGizmo
        :quaternion="cameraOrientation.quaternion"
        @view="changeCameraView"
      />
    </section>

    <aside class="inspector-panel" data-testid="inspector-panel">
      <nav class="inspector-tabs">
        <button
          type="button"
          :class="{ active: inspectorTab === 'scene' }"
          @click="inspectorTab = 'scene'"
        >
          场景内容
        </button>
        <button
          type="button"
          :class="{ active: inspectorTab === 'interaction' }"
          @click="inspectorTab = 'interaction'"
        >
          交互事件
        </button>
        <button
          type="button"
          :class="{ active: inspectorTab === 'socket' }"
          @click="inspectorTab = 'socket'"
        >
          Socket 任务
        </button>
        <button
          type="button"
          :class="{ active: inspectorTab === 'settings' }"
          @click="inspectorTab = 'settings'"
        >
          项目配置
        </button>
      </nav>
      <div v-if="inspectorTab === 'scene'" class="scene-content-panel">
        <SceneTree
          :document="document"
          :change-version="documentChangeVersion"
          :selection="selection"
          @select="changeSelection"
          @toggle-visible="
            (id, enabled) => runCommand(commands.updateNode(id, { enabled }))
          "
          @toggle-locked="
            (id, locked) => runCommand(commands.updateNode(id, { locked }))
          "
          @rename="(id, name) => runCommand(commands.updateNode(id, { name }))"
          @remove="(id) => runCommand(commands.removeNodes([id]))"
          @duplicate="(id) => runCommand(commands.duplicateNode(id))"
          @group="(ids) => runCommand(commands.groupNodes(ids))"
          @reparent="
            (id, parentId, index) =>
              runCommand(commands.reparentNode(id, parentId, index))
          "
        />
        <NodeInspector
          v-if="selectedNode"
          :node="selectedNode"
          :texture-assets="textureAssets"
          @update="
            (patch) => runCommand(commands.updateNode(selectedNode!.id, patch))
          "
        />
        <div v-else class="empty-panel">选择节点后编辑属性</div>
      </div>
      <div v-else-if="inspectorTab === 'interaction'" class="runtime-tab-panel">
        <InteractionPanel
          :nodes="runtimeNodes"
          :interactions="document.interactions"
          :data-sources="document.dataSources"
          @commit="commitRuntimeConfig"
        />
        <RuntimeDiagnostics :entries="runtimeDiagnostics" />
      </div>
      <div v-else-if="inspectorTab === 'socket'" class="runtime-tab-panel">
        <SocketTaskPanel
          :nodes="runtimeNodes"
          :data-sources="document.dataSources"
          :socket-tasks="document.socketTasks"
          @commit="commitRuntimeConfig"
          @simulate="simulateSocket"
        />
        <RuntimeDiagnostics :entries="runtimeDiagnostics" />
      </div>
      <SceneSettingsInspector
        v-else
        :settings="document.settings"
        @update="(patch) => runCommand(commands.updateSceneSettings(patch))"
      />
    </aside>

    <section v-if="publication" class="publication-result">
      <strong>发布成功</strong>
      <a :href="publication.runtimeUrl" target="_blank">{{
        publication.runtimeUrl
      }}</a>
      <button type="button" @click="copyText(publication.runtimeUrl)">
        复制地址
      </button>
      <button type="button" @click="copyText(publication.iframeCode)">
        复制 iframe
      </button>
      <button
        type="button"
        aria-label="关闭发布结果"
        @click="publication = undefined"
      >
        ×
      </button>
    </section>
  </main>
</template>
