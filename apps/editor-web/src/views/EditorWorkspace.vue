<script setup lang="ts">
import type { Asset } from '@digital-twin/api-contracts';
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
import SceneSettingsInspector from '../components/editor/SceneSettingsInspector.vue';
import SceneTree from '../components/editor/SceneTree.vue';
import {
  useEditorCommands,
  type EditorCanvasBridge,
} from '../editor/useEditorCommands';
import { useDocumentStore, type SaveState } from '../stores/document';
import { useSelectionStore } from '../stores/selection';

const props = withDefaults(
  defineProps<{ projectId?: string; sceneId?: string }>(),
  { projectId: 'local-project', sceneId: 'local-scene' },
);
const store = useDocumentStore();
const { document, saveState, error, canUndo, canRedo } = storeToRefs(store);
const selectionStore = useSelectionStore();
const { ids: selectedIds, primaryId } = storeToRefs(selectionStore);
const canvas = ref<EditorCanvasBridge>();
const inspectorTab = ref<'scene' | 'interaction' | 'socket' | 'settings'>(
  'scene',
);

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
        <ElButton size="small">预览</ElButton>
        <ElButton type="primary" size="small">发布</ElButton>
      </ElButtonGroup>
    </header>

    <aside class="asset-panel" data-testid="asset-panel">
      <h2>场景元素</h2>
      <nav class="asset-categories">
        <button type="button" class="active">模型</button>
        <button type="button">几何体</button>
        <button type="button">灯光</button>
        <button type="button">图表</button>
        <button type="button">文本</button>
        <button type="button">视频</button>
        <button type="button">Shader</button>
      </nav>
      <AssetLibraryPanel @activate="activateAsset" />
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
      <div v-else-if="inspectorTab === 'interaction'" class="empty-panel">
        低代码交互编排将在下一阶段接入
      </div>
      <div v-else-if="inspectorTab === 'socket'" class="empty-panel">
        WebSocket 数据源与任务面板将在下一阶段接入
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
  </main>
</template>
