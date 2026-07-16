<script setup lang="ts">
import type { Asset, PublicationDetail } from '@digital-twin/api-contracts';
import type { RuntimeConfigPatch } from '@digital-twin/editor-core';
import type {
  SceneStats,
  SelectionState,
  TransformCommit,
} from '@digital-twin/three-engine';
import { ElButton, ElButtonGroup, ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EditorCanvas from '../components/EditorCanvas.vue';
import AssetLibraryPanel from '../components/AssetLibraryPanel.vue';
import NodeInspector from '../components/editor/NodeInspector.vue';
import InteractionPanel from '../components/editor/InteractionPanel.vue';
import RuntimeDiagnostics from '../components/editor/RuntimeDiagnostics.vue';
import SceneSettingsInspector from '../components/editor/SceneSettingsInspector.vue';
import SceneTree from '../components/editor/SceneTree.vue';
import SocketTaskPanel from '../components/editor/SocketTaskPanel.vue';
import {
  useEditorCommands,
  type EditorCanvasBridge,
} from '../editor/useEditorCommands';
import { useDocumentStore, type SaveState } from '../stores/document';
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

onMounted(() => window.addEventListener('keydown', commands.handleKeydown));

onBeforeUnmount(() => {
  window.removeEventListener('keydown', commands.handleKeydown);
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
    <header class="top-toolbar" data-testid="top-toolbar">
      <div class="brand-block">
        <span class="brand-dot" />
        <strong>数字孪生场景平台</strong>
        <span class="scene-name">{{ document.name }}</span>
      </div>
      <ElButtonGroup>
        <ElButton
          size="small"
          data-testid="undo-scene"
          :disabled="!canUndo"
          @click="undoCommand"
        >
          撤销
        </ElButton>
        <ElButton
          size="small"
          data-testid="redo-scene"
          :disabled="!canRedo"
          @click="redoCommand"
        >
          重做
        </ElButton>
        <ElButton
          size="small"
          :loading="saveState === 'saving'"
          :disabled="saveState === 'loading'"
          data-testid="save-scene"
          @click="saveDocument"
        >
          保存
        </ElButton>
        <ElButton
          v-if="saveState === 'conflict'"
          size="small"
          @click="reloadScene"
        >
          重新加载
        </ElButton>
        <ElButton size="small" data-testid="preview-scene" @click="openPreview">
          预览
        </ElButton>
        <ElButton
          type="primary"
          size="small"
          :loading="publishing"
          data-testid="publish-scene"
          @click="publishScene"
        >
          发布
        </ElButton>
      </ElButtonGroup>
    </header>

    <aside class="asset-panel" data-testid="asset-panel">
      <h2>场景元素</h2>
      <nav class="asset-categories">
        <button
          v-for="item in [
            ['model', '模型'],
            ['geometry', '几何体'],
            ['light', '灯光'],
            ['chart', '图表'],
            ['text', '文本'],
            ['video', '视频'],
            ['shader', 'Shader'],
          ] as const"
          :key="item[0]"
          type="button"
          :data-asset-category="item[0]"
          :class="{ active: assetCategory === item[0] }"
          @click="assetCategory = item[0]"
        >
          {{ item[1] }}
        </button>
      </nav>
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
    </aside>

    <section class="viewport-shell">
      <div class="viewport-tools">
        <button
          type="button"
          data-tool="translate"
          @click="commands.setTransformMode('translate')"
        >
          移动 W
        </button>
        <button
          type="button"
          data-tool="rotate"
          @click="commands.setTransformMode('rotate')"
        >
          旋转 E
        </button>
        <button
          type="button"
          data-tool="scale"
          @click="commands.setTransformMode('scale')"
        >
          缩放 R
        </button>
        <button
          type="button"
          data-tool="focus"
          @click="commands.focusSelection"
        >
          聚焦 F
        </button>
      </div>
      <EditorCanvas
        ref="canvas"
        :document="document"
        @select="changeSelection"
        @transform-commit="commitTransform"
        @asset-drop="dropAsset"
        @stats-change="changeStats"
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

    <footer class="status-bar" data-testid="status-bar">
      <span>对象 {{ stats.objectCount }}</span>
      <span>网格 {{ stats.meshCount }}</span>
      <span>顶点 {{ stats.vertexCount.toLocaleString() }}</span>
      <span>面 {{ stats.faceCount.toLocaleString() }}</span
      ><span>FPS --</span>
      <span
        class="save-state"
        :class="{
          'save-state--error':
            saveState === 'conflict' || saveState === 'error',
        }"
        :title="error"
      >
        {{ stateLabel }}
      </span>
    </footer>

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
