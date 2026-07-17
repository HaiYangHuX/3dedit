<script setup lang="ts">
import {
  EditorEngine,
  type CameraOrientation,
  type CameraView,
  type ModelStructureMap,
  type RenderStats,
  type SceneStats,
  type SelectionState,
  type TransformCommit,
} from '@digital-twin/three-engine';
import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  readScenePaletteDrag,
  type ScenePaletteDropPayload,
} from '../editor/scenePaletteDrag';
import { editorAssetResolver } from '../three/editorAssetResolver';

const props = withDefaults(
  defineProps<{
    document: SceneDocument;
    gridSize?: number | null;
  }>(),
  { gridSize: 0.5 },
);
const emit = defineEmits<{
  select: [selection: SelectionState];
  'transform-commit': [commit: TransformCommit];
  'scene-drop': [payload: ScenePaletteDropPayload];
  'stats-change': [stats: SceneStats];
  'camera-change': [orientation: CameraOrientation];
  'pointer-lock-change': [active: boolean];
  'measure-change': [active: boolean];
  'render-stats-change': [stats: RenderStats];
  'model-structure-change': [structures: ModelStructureMap];
}>();

const container = ref<HTMLDivElement>();
const errorMessage = ref('');
const engine = new EditorEngine();
let initialized = false;
let disposed = false;
let loadGeneration = 0;

function handleSelectionChange(
  event: SelectionState & { type: 'selectionchange' },
): void {
  emit('select', { ids: [...event.ids], primaryId: event.primaryId });
}

function handleTransformEnd(
  event: TransformCommit & { type: 'transformend' },
): void {
  emit('transform-commit', {
    nodeId: event.nodeId,
    before: event.before,
    after: event.after,
  });
}

function handleStatsChange(event: SceneStats & { type: 'statschange' }): void {
  if (container.value) {
    container.value.dataset.sceneObjectCount = String(event.objectCount);
  }
  emit('stats-change', {
    objectCount: event.objectCount,
    meshCount: event.meshCount,
    vertexCount: event.vertexCount,
    faceCount: event.faceCount,
  });
}

function handleCameraChange(
  event: CameraOrientation & { type: 'camerachange' },
): void {
  emit('camera-change', { quaternion: [...event.quaternion] });
}

function handlePointerLockChange(
  event: { active: boolean } & { type: 'pointerlockchange' },
): void {
  emit('pointer-lock-change', event.active);
}

function handleMeasureChange(
  event: { active: boolean } & { type: 'measurechange' },
): void {
  emit('measure-change', event.active);
}

function handleRenderStatsChange(
  event: RenderStats & { type: 'renderstatschange' },
): void {
  emit('render-stats-change', {
    fps: event.fps,
    drawCalls: event.drawCalls,
  });
}

engine.addEventListener('selectionchange', handleSelectionChange);
engine.addEventListener('transformend', handleTransformEnd);
engine.addEventListener('statschange', handleStatsChange);
engine.addEventListener('camerachange', handleCameraChange);
engine.addEventListener('pointerlockchange', handlePointerLockChange);
engine.addEventListener('measurechange', handleMeasureChange);
engine.addEventListener('renderstatschange', handleRenderStatsChange);

async function loadDocument(document = props.document): Promise<void> {
  if (!initialized) return;
  const generation = ++loadGeneration;
  errorMessage.value = '';
  try {
    await engine.loadDocument(document, editorAssetResolver);
    if (disposed || generation !== loadGeneration) return;
    emit('model-structure-change', engine.getModelStructures());
    if (container.value) container.value.dataset.engineReady = 'true';
  } catch (error) {
    if (disposed || generation !== loadGeneration) return;
    errorMessage.value =
      error instanceof Error ? error.message : '场景文档加载失败';
  }
}

async function applyNodeAdded(node: SceneNode): Promise<void> {
  await engine.addNode(node);
  emit('model-structure-change', engine.getModelStructures());
}

function applyNodeRemoved(ids: Iterable<string>): void {
  engine.removeNodes(ids);
  emit('model-structure-change', engine.getModelStructures());
}

async function applyNodeUpdated(node: SceneNode): Promise<void> {
  try {
    await engine.updateNode(node);
    // 模型 assetId 替换会换新整棵 Object3D，必须等待替换完成再发送 UUID 快照。
    emit('model-structure-change', engine.getModelStructures());
  } catch (error: unknown) {
    errorMessage.value =
      error instanceof Error ? error.message : '节点运行对象重建失败';
    throw error;
  }
}

function applySceneSettings(settings: SceneDocument['settings']): void {
  void engine.updateSettings(settings).catch((error: unknown) => {
    errorMessage.value =
      error instanceof Error ? error.message : '场景环境加载失败';
  });
}

function setSelection(ids: Iterable<string>, primaryId?: string | null): void {
  engine.setSelection(ids, primaryId);
}

function setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
  engine.setTransformMode(mode);
}

function setTransformSpace(space: 'local' | 'world'): void {
  engine.setTransformSpace(space);
}

function handleShortcut(code: string): boolean {
  return engine.handleShortcut(code);
}

function focusSelection(): boolean {
  return engine.focusSelection();
}

function setCameraView(view: CameraView): void {
  engine.setCameraView(view);
}

function resetCamera(): void {
  engine.resetCamera();
}

function togglePointerLock(): boolean {
  return engine.togglePointerLock();
}

function setMeasurementEnabled(enabled: boolean): boolean {
  return engine.setMeasurementEnabled(enabled);
}

function setSelectWholeModel(enabled: boolean): void {
  engine.setSelectWholeModel(enabled);
}

function alignModelsToGround(): TransformCommit[] {
  return engine.alignModelsToGround();
}

function captureScreenshot(): Promise<Blob> {
  return engine.captureScreenshot();
}

function allowSceneDrop(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function dropSceneItem(event: DragEvent): void {
  event.preventDefault();
  const payload = readScenePaletteDrag(event.dataTransfer);
  if (!payload) return;
  // Engine 使用实际 WebGL canvas 矩形计算 NDC，不能用包含左右面板的窗口尺寸。
  emit('scene-drop', {
    ...payload,
    position: engine.getDropPosition(
      event.clientX,
      event.clientY,
      props.gridSize,
    ),
  });
}

onMounted(async () => {
  if (!container.value) return;
  try {
    await engine.initialize(container.value);
    if (disposed) return;
    initialized = true;
    await loadDocument();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '三维视口初始化失败';
  }
});

watch(
  () => props.document,
  (document, previous) => {
    // Store 替换文档身份表示路由切换或服务端快照替换；普通属性编辑使用增量桥接。
    if (initialized && document !== previous) void loadDocument(document);
  },
);

// 卸载时先使所有异步加载结果失效，再对称释放监听器和 Engine 所有权。
onBeforeUnmount(() => {
  disposed = true;
  initialized = false;
  loadGeneration += 1;
  engine.removeEventListener('selectionchange', handleSelectionChange);
  engine.removeEventListener('transformend', handleTransformEnd);
  engine.removeEventListener('statschange', handleStatsChange);
  engine.removeEventListener('camerachange', handleCameraChange);
  engine.removeEventListener('pointerlockchange', handlePointerLockChange);
  engine.removeEventListener('measurechange', handleMeasureChange);
  engine.removeEventListener('renderstatschange', handleRenderStatsChange);
  engine.dispose();
});

defineExpose({
  loadDocument,
  applyNodeAdded,
  applyNodeRemoved,
  applyNodeUpdated,
  applySceneSettings,
  setSelection,
  setTransformMode,
  setTransformSpace,
  handleShortcut,
  focusSelection,
  setCameraView,
  resetCamera,
  togglePointerLock,
  setMeasurementEnabled,
  setSelectWholeModel,
  alignModelsToGround,
  captureScreenshot,
});
</script>

<template>
  <div
    ref="container"
    class="editor-canvas"
    data-testid="editor-canvas"
    @dragover="allowSceneDrop"
    @drop="dropSceneItem"
  >
    <div v-if="errorMessage" class="canvas-error">{{ errorMessage }}</div>
  </div>
</template>
