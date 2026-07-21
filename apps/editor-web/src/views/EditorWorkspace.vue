<script setup lang="ts">
import type { Asset, PublicationDetail } from '@digital-twin/api-contracts';
import type { RuntimeConfigPatch } from '@digital-twin/editor-core';
import type { SceneCamera } from '@digital-twin/scene-schema';
import {
  BUILTIN_ENVIRONMENT_PREVIEW_URL,
  type CameraRoamingState,
  type ModelAssetFormat,
  type ModelStructureMap,
  type RenderStats,
  type SceneStats,
  type SelectionState,
  type TransformCommit,
} from '@digital-twin/three-engine';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { createUuid } from '../utils/createUuid';
import EditorCanvas from '../components/EditorCanvas.vue';
import AssetLibraryPanel from '../components/AssetLibraryPanel.vue';
import AssetPalette from '../components/editor/AssetPalette.vue';
import EditorTopBar from '../components/editor/EditorTopBar.vue';
import EditorHelpPanel from '../components/editor/EditorHelpPanel.vue';
import CameraInspector from '../components/editor/CameraInspector.vue';
import NodeInspector from '../components/editor/NodeInspector.vue';
import InteractionPanel from '../components/editor/InteractionPanel.vue';
import RuntimeDiagnostics from '../components/editor/RuntimeDiagnostics.vue';
import SceneSettingsInspector from '../components/editor/SceneSettingsInspector.vue';
import SceneTree from '../components/editor/SceneTree.vue';
import SocketTaskPanel from '../components/editor/SocketTaskPanel.vue';
import ViewportStats from '../components/editor/ViewportStats.vue';
import ViewportToolbar from '../components/editor/ViewportToolbar.vue';
import {
  useEditorCommands,
  type EditorCanvasBridge,
} from '../editor/useEditorCommands';
import {
  writeScenePaletteDrag,
  type ScenePaletteDragPayload,
  type ScenePaletteDropPayload,
} from '../editor/scenePaletteDrag';
import { useDocumentStore, type SaveState } from '../stores/document';
import { useAssetStore } from '../stores/asset';
import { useSelectionStore } from '../stores/selection';
import { assetApi } from '../api/assets';
import { publicationApi } from '../api/publications';

const props = withDefaults(
  defineProps<{ projectId?: string; sceneId?: string }>(),
  { projectId: 'local-project', sceneId: 'local-scene' },
);
const router = useRouter();
const store = useDocumentStore();
const { document, documentChangeVersion, saveState, error } =
  storeToRefs(store);
const selectionStore = useSelectionStore();
const { ids: selectedIds, primaryId } = storeToRefs(selectionStore);
const canvas = ref<EditorCanvasBridge>();
const assetStore = useAssetStore();
const { assets } = storeToRefs(assetStore);
const inspectorTab = ref<
  'scene' | 'interaction' | 'socket' | 'settings' | 'help'
>('scene');
const assetCategory = ref<
  'model' | 'geometry' | 'light' | 'chart' | 'text' | 'video' | 'shader'
>('model');
const runtimeNodes = computed(() => Object.values(document.value.nodes));
const runtimeDiagnostics = ref<string[]>([]);
const publication = ref<PublicationDetail>();
const publishing = ref(false);
const settingsUploading = ref(false);
const transformMode = ref<'translate' | 'rotate' | 'scale'>('translate');
const renderStats = ref<RenderStats>({ fps: 0, drawCalls: 0 });
const isPointerLock = ref(false);
const isMeasuring = ref(false);
const isChooseAllModel = ref(true);
const modelStructures = ref<ModelStructureMap>({});
const modelAssetFormats = ref<Partial<Record<string, ModelAssetFormat>>>({});
const selectedModelPart = ref<{ nodeId: string; objectId: string } | null>(
  null,
);
const cameraSelected = ref(false);
const cameraRoamingState = ref<CameraRoamingState>({
  mode: 'idle',
  pointCount: 0,
  activePathId: null,
});
let assetFormatGeneration = 0;
let previewWindow: Window | null = null;
const runtimeOrigin = (
  import.meta.env.VITE_RUNTIME_ORIGIN ?? 'http://127.0.0.1:5174'
).replace(/\/$/, '');

function showEditorError(reason: unknown, fallback = '编辑操作执行失败'): void {
  ElMessage.error(reason instanceof Error ? reason.message : fallback);
}

function backToProject(): void {
  // 返回只切换管理路由，不隐式保存草稿，避免破坏“点击保存才提交”的边界。
  const target =
    props.projectId && props.projectId !== 'local-project'
      ? `/projects/${encodeURIComponent(props.projectId)}`
      : '/projects';
  void router.push(target);
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
const modelFormats = new Set<ModelAssetFormat>([
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'usdz',
]);

async function loadReferencedModelAssetFormats(): Promise<void> {
  const generation = ++assetFormatGeneration;
  const assetIds = new Set<string>();
  for (const node of Object.values(document.value.nodes)) {
    for (const component of node.components) {
      if (component.kind === 'model') assetIds.add(component.assetId);
    }
  }
  const listed = new Map(assets.value.map((asset) => [asset.id, asset]));
  const entries = await Promise.all(
    [...assetIds].map(async (assetId) => {
      try {
        const asset = listed.get(assetId) ?? (await assetApi.get(assetId));
        return modelFormats.has(asset.format as ModelAssetFormat)
          ? ([assetId, asset.format as ModelAssetFormat] as const)
          : undefined;
      } catch {
        // 名称格式解析失败不影响 Engine 使用自己的资源解析器加载模型主体。
        return undefined;
      }
    }),
  );
  if (generation !== assetFormatGeneration) return;
  modelAssetFormats.value = Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, ModelAssetFormat] =>
        entry !== undefined,
    ),
  );
}

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
    // Object3D UUID 只对当前引擎加载代次有效，切场景时先清空防止短暂显示旧层级。
    modelStructures.value = {};
    modelAssetFormats.value = {};
    selectedModelPart.value = null;
    cameraSelected.value = false;
    cameraRoamingState.value = {
      mode: 'idle',
      pointCount: 0,
      activePathId: null,
    };
    void Promise.resolve(store.loadScene(sceneId))
      .then(() => loadReferencedModelAssetFormats())
      .catch(() => {
        // 状态栏展示详细错误，保留引擎视口以便用户重试。
      });
  },
  { immediate: true },
);

onMounted(() => {
  // 使用捕获阶段优先接管 Ctrl/Cmd+Z 等浏览器默认快捷键，再交给可编辑控件自行处理。
  window.addEventListener('keydown', commands.handleKeydown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', commands.handleKeydown, true);
  store.dispose();
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

function beginPaletteDrag(
  event: DragEvent,
  payload: ScenePaletteDragPayload,
): void {
  if (event.dataTransfer) writeScenePaletteDrag(event.dataTransfer, payload);
}

function dropSceneItem(payload: ScenePaletteDropPayload): void {
  if (payload.kind === 'asset') {
    void commands
      .addAssetNode(
        {
          id: payload.assetId,
          name: payload.name,
          format: payload.format,
        },
        payload.position,
      )
      .catch((reason) => showEditorError(reason, '添加模型失败'));
    return;
  }

  // 原站把普通拖放落点抬到 y=0.5；模型保留现有 y=0 自动落地语义。
  const position: [number, number, number] = [
    payload.position[0],
    Math.max(0.5, payload.position[1]),
    payload.position[2],
  ];
  const operation =
    payload.kind === 'geometry'
      ? commands.addGeometry(payload.primitive, position)
      : commands.addLight(payload.lightType, position);
  void operation.catch((reason) =>
    showEditorError(
      reason,
      payload.kind === 'geometry' ? '添加几何体失败' : '添加灯光失败',
    ),
  );
}

function commitTransform(commit: TransformCommit): void {
  void commands
    .commitTransform(commit)
    .catch((reason) => showEditorError(reason, '保存变换失败'));
}

async function resetScene(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将清空当前场景节点，并恢复项目配置、Camera、漫游和交互设置。重置结果需要再次点击“保存”才会提交。',
      '重置场景',
      {
        type: 'warning',
        confirmButtonText: '重置',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  try {
    await commands.resetScene();
    cameraSelected.value = false;
    selectedModelPart.value = null;
    modelStructures.value = {};
    modelAssetFormats.value = {};
    cameraRoamingState.value = {
      mode: 'idle',
      pointCount: 0,
      activePathId: null,
    };
    publication.value = undefined;
    inspectorTab.value = 'scene';
    ElMessage.success('场景已重置，请点击“保存”提交');
  } catch (reason) {
    showEditorError(reason, '场景重置失败');
  }
}

function runCommand(operation: Promise<unknown>): void {
  void operation.catch(showEditorError);
}

async function uploadSceneSettingAsset(
  file: File,
  target: 'background' | 'environment',
): Promise<void> {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (!extension || !['jpg', 'png', 'hdr'].includes(extension)) {
    ElMessage.error('仅支持 .jpg、.png、.hdr 场景资源');
    return;
  }
  settingsUploading.value = true;
  try {
    const task = await assetStore.uploadFile(file, {
      category: target === 'background' ? '场景背景' : '场景环境',
      tags: ['项目配置', target === 'background' ? '背景' : '环境'],
    });
    if (task.status !== 'ready' || !task.assetId) {
      throw new Error('资源尚未处理完成');
    }
    await commands.updateSceneSettings(
      target === 'background'
        ? { backgroundType: 'texture', backgroundAssetId: task.assetId }
        : { environmentEnabled: true, environmentAssetId: task.assetId },
    );
    ElMessage.success(
      target === 'background' ? '背景图已更新' : '环境贴图已更新',
    );
  } catch (reason) {
    showEditorError(reason, '场景资源上传失败');
  } finally {
    settingsUploading.value = false;
  }
}

function changeCanvasSelection(selection: SelectionState): void {
  cameraSelected.value = false;
  selectedModelPart.value = null;
  commands.selectFromCanvas(selection);
}

function changeTreeSelection(selection: SelectionState): void {
  cameraSelected.value = false;
  selectedModelPart.value = null;
  commands.select(selection);
}

function selectCamera(): void {
  selectedModelPart.value = null;
  // Camera 不是 SceneNode，先清空业务选择和 TransformControls。
  // setSelection 可能同步回调 changeCanvasSelection，最后再置 true 才不会被空选择事件吞掉。
  commands.select({ ids: [], primaryId: null });
  cameraSelected.value = true;
}

function changeModelPartSelection(selection: {
  nodeId: string;
  objectId: string;
  targetObjectId: string;
}): void {
  cameraSelected.value = false;
  const selected =
    canvas.value?.selectModelPart?.(
      selection.nodeId,
      selection.targetObjectId,
    ) ?? false;
  selectedModelPart.value = selected
    ? { nodeId: selection.nodeId, objectId: selection.objectId }
    : null;
}

function removeModelPart(selection: {
  nodeId: string;
  partPath: string;
  objectId: string;
}): void {
  // 删除后模型结构会异步刷新；先清理当前 Mesh 选择，避免高亮引用已隐藏的 UUID。
  if (
    selectedModelPart.value?.nodeId === selection.nodeId &&
    selectedModelPart.value.objectId === selection.objectId
  ) {
    selectedModelPart.value = null;
  }
  runCommand(commands.removeModelPart(selection.nodeId, selection.partPath));
}

function changeCameraState(camera: SceneCamera): void {
  if (JSON.stringify(camera) === JSON.stringify(document.value.camera)) return;
  runCommand(commands.syncCameraFromCanvas(camera));
}

function changeCameraRoamingState(state: CameraRoamingState): void {
  cameraRoamingState.value = state;
}

function createCameraRoamingPath(
  pathPoints: Array<[number, number, number]>,
): void {
  const paths = document.value.cameraRoamingList;
  runCommand(
    commands.replaceCameraRoamingList([
      ...paths,
      {
        id: createUuid(),
        name: `漫游路径 ${paths.length + 1}`,
        pathPoints,
      },
    ]),
  );
}

function startCameraRoamingDrawing(): void {
  if (!commands.startCameraRoamingDrawing()) {
    ElMessage.warning('三维视口尚未就绪');
  }
}

function previewCameraRoaming(pathId: string): void {
  if (!commands.previewCameraRoaming(pathId)) {
    ElMessage.warning('漫游路径不可用');
  }
}

async function removeCameraRoamingPath(pathId: string): Promise<void> {
  try {
    await ElMessageBox.confirm('确定删除该相机漫游路径吗？', '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  await commands.replaceCameraRoamingList(
    document.value.cameraRoamingList.filter((path) => path.id !== pathId),
  );
}

function changeStats(value: SceneStats): void {
  stats.value = value;
}

function changePointerLock(active: boolean): void {
  isPointerLock.value = active;
}

function changeMeasure(active: boolean): void {
  isMeasuring.value = active;
}

function changeRenderStats(value: RenderStats): void {
  renderStats.value = value;
}

function changeModelStructures(value: ModelStructureMap): void {
  modelStructures.value = value;
  const current = selectedModelPart.value;
  if (
    current &&
    !(value[current.nodeId] ?? []).some(
      (part) => part.objectId === current.objectId,
    )
  ) {
    // 模型替换会生成整批新 UUID，旧二级 current key 不能跨加载代次复用。
    selectedModelPart.value = null;
    canvas.value?.setSelection(selectedIds.value, primaryId.value);
  }
}

watch(primaryId, (nodeId) => {
  if (selectedModelPart.value?.nodeId !== nodeId) {
    selectedModelPart.value = null;
  }
});

function changeTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
  transformMode.value = mode;
  commands.setTransformMode(mode);
}

function alignModelsToGround(): void {
  runCommand(commands.alignModelsToGround());
}

function togglePointerLock(): void {
  // 引擎返回值用于同步 PointerLock API 的实际状态。
  isPointerLock.value = commands.togglePointerLock();
}

function toggleMeasurement(active: boolean): void {
  const next = commands.setMeasurementEnabled(active);
  isMeasuring.value = next;
}

function toggleChooseAllModel(active: boolean): void {
  isChooseAllModel.value = active;
  commands.setSelectWholeModel(active);
}

function requireExplicitSaveBeforeRuntimeAction(): void {
  if (saveState.value !== 'saved') {
    throw new Error('当前场景有未保存更改，请先点击“保存”');
  }
}

async function openPreview(): Promise<void> {
  try {
    // 预览只读取服务端文档；禁止在预览入口隐式保存，保存边界必须由顶部按钮触发。
    requireExplicitSaveBeforeRuntimeAction();
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
    // 发布同样不应绕过显式保存，否则用户看到的草稿与发布内容会产生歧义。
    requireExplicitSaveBeforeRuntimeAction();
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
      :saving="saveState === 'saving'"
      :publishing="publishing"
      :show-reload="saveState === 'conflict'"
      @back-to-project="backToProject"
      @reset="resetScene"
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
          draggable="true"
          :title="`${item[1]}（点击添加，或拖入视口）`"
          :data-testid="`add-geometry-${item[0]}`"
          @dragstart="
            beginPaletteDrag($event, {
              kind: 'geometry',
              primitive: item[0],
            })
          "
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
          draggable="true"
          :title="`${item[1]}（点击添加，或拖入视口）`"
          :data-testid="`add-light-${item[0]}`"
          @dragstart="
            beginPaletteDrag($event, {
              kind: 'light',
              lightType: item[0],
            })
          "
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

    <section class="viewport-shell">
      <ViewportToolbar
        :mode="transformMode"
        :is-pointer-lock="isPointerLock"
        :is-measuring="isMeasuring"
        :is-choose-all-model="isChooseAllModel"
        @mode="changeTransformMode"
        @align-ground="alignModelsToGround"
        @pointer-lock="togglePointerLock"
        @measure="toggleMeasurement"
        @reset="commands.resetCamera"
        @choose-all="toggleChooseAllModel"
      />
      <EditorCanvas
        ref="canvas"
        :document="document"
        @select="changeCanvasSelection"
        @transform-commit="commitTransform"
        @scene-drop="dropSceneItem"
        @stats-change="changeStats"
        @camera-state-change="changeCameraState"
        @camera-roaming-state-change="changeCameraRoamingState"
        @camera-roaming-path-created="createCameraRoamingPath"
        @pointer-lock-change="changePointerLock"
        @measure-change="changeMeasure"
        @render-stats-change="changeRenderStats"
        @model-structure-change="changeModelStructures"
      />
      <ViewportStats :scene="stats" :render="renderStats" />
      <div
        v-if="cameraRoamingState.mode !== 'idle'"
        class="camera-roaming-viewport-status"
      >
        <template v-if="cameraRoamingState.mode === 'previewing'">
          <strong>漫游中..</strong>
          <button type="button" @click="commands.stopCameraRoaming">
            取消
          </button>
        </template>
        <template v-else>
          <span>Ctrl / ⌘ + 左键定点</span>
          <span>→</span>
          <span>松开 Ctrl / ⌘ 结束</span>
        </template>
      </div>
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
        <button
          type="button"
          :class="{ active: inspectorTab === 'help' }"
          @click="inspectorTab = 'help'"
        >
          帮助
        </button>
      </nav>
      <div v-if="inspectorTab === 'scene'" class="scene-content-panel">
        <SceneTree
          :document="document"
          :change-version="documentChangeVersion"
          :selection="selection"
          :model-structures="modelStructures"
          :model-asset-formats="modelAssetFormats"
          :selected-model-part="selectedModelPart"
          :camera-selected="cameraSelected"
          @select-camera="selectCamera"
          @select="changeTreeSelection"
          @select-model-part="changeModelPartSelection"
          @toggle-visible="
            (id, enabled) => runCommand(commands.updateNode(id, { enabled }))
          "
          @toggle-locked="
            (id, locked) => runCommand(commands.updateNode(id, { locked }))
          "
          @rename="(id, name) => runCommand(commands.updateNode(id, { name }))"
          @remove="(id) => runCommand(commands.removeNodes([id]))"
          @remove-model-part="removeModelPart"
          @duplicate="(id) => runCommand(commands.duplicateNode(id))"
          @group="(ids) => runCommand(commands.groupNodes(ids))"
          @reparent="
            (id, parentId, index) =>
              runCommand(commands.reparentNode(id, parentId, index))
          "
        />
        <CameraInspector
          v-if="cameraSelected"
          :camera="document.camera"
          :paths="document.cameraRoamingList"
          :roaming-state="cameraRoamingState"
          :change-version="documentChangeVersion"
          @update="(patch) => runCommand(commands.updateCamera(patch))"
          @start-drawing="startCameraRoamingDrawing"
          @cancel-drawing="commands.cancelCameraRoamingDrawing"
          @preview="previewCameraRoaming"
          @stop="commands.stopCameraRoaming"
          @remove="removeCameraRoamingPath"
        />
        <NodeInspector
          v-else-if="selectedNode"
          :node="selectedNode"
          :change-version="documentChangeVersion"
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
      <EditorHelpPanel v-else-if="inspectorTab === 'help'" />
      <SceneSettingsInspector
        v-else
        :settings="document.settings"
        :change-version="documentChangeVersion"
        :assets="assets"
        :uploading="settingsUploading"
        :builtin-environment-preview-url="BUILTIN_ENVIRONMENT_PREVIEW_URL"
        @update="(patch) => runCommand(commands.updateSceneSettings(patch))"
        @upload-background="uploadSceneSettingAsset($event, 'background')"
        @upload-environment="uploadSceneSettingAsset($event, 'environment')"
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
