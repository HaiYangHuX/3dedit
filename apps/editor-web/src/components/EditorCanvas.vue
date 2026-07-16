<script setup lang="ts">
import {
  EditorEngine,
  type ModelAssetFormat,
  type SceneStats,
  type SelectionState,
  type TransformCommit,
} from '@digital-twin/three-engine';
import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { editorAssetResolver } from '../three/editorAssetResolver';

const ASSET_MIME = 'application/x-digital-twin-asset';
const supportedFormats = new Set<ModelAssetFormat>([
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'usdz',
]);

interface DraggedAsset {
  assetId: string;
  name: string;
  format: ModelAssetFormat;
}

interface AssetDropPayload extends DraggedAsset {
  position: [number, number, number];
}

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
  'asset-drop': [payload: AssetDropPayload];
  'stats-change': [stats: SceneStats];
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
  emit('stats-change', {
    objectCount: event.objectCount,
    meshCount: event.meshCount,
    vertexCount: event.vertexCount,
    faceCount: event.faceCount,
  });
}

engine.addEventListener('selectionchange', handleSelectionChange);
engine.addEventListener('transformend', handleTransformEnd);
engine.addEventListener('statschange', handleStatsChange);

async function loadDocument(document = props.document): Promise<void> {
  if (!initialized) return;
  const generation = ++loadGeneration;
  errorMessage.value = '';
  try {
    await engine.loadDocument(document, editorAssetResolver);
    if (disposed || generation !== loadGeneration) return;
    if (container.value) container.value.dataset.engineReady = 'true';
  } catch (error) {
    if (disposed || generation !== loadGeneration) return;
    errorMessage.value =
      error instanceof Error ? error.message : '场景文档加载失败';
  }
}

async function applyNodeAdded(node: SceneNode): Promise<void> {
  await engine.addNode(node);
}

function applyNodeRemoved(ids: Iterable<string>): void {
  engine.removeNodes(ids);
}

function applyNodeUpdated(node: SceneNode): void {
  engine.updateNode(node);
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

function focusSelection(): boolean {
  return engine.focusSelection();
}

function parseDraggedAsset(event: DragEvent): DraggedAsset | undefined {
  const raw = event.dataTransfer?.getData(ASSET_MIME);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<DraggedAsset>;
    if (
      typeof value.assetId !== 'string' ||
      typeof value.name !== 'string' ||
      typeof value.format !== 'string' ||
      !supportedFormats.has(value.format as ModelAssetFormat)
    ) {
      return undefined;
    }
    return value as DraggedAsset;
  } catch {
    return undefined;
  }
}

function allowAssetDrop(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function dropAsset(event: DragEvent): void {
  event.preventDefault();
  const asset = parseDraggedAsset(event);
  if (!asset) return;
  emit('asset-drop', {
    ...asset,
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
  engine.dispose();
});

defineExpose({
  loadDocument,
  applyNodeAdded,
  applyNodeRemoved,
  applyNodeUpdated,
  setSelection,
  setTransformMode,
  setTransformSpace,
  focusSelection,
});
</script>

<template>
  <div
    ref="container"
    class="editor-canvas"
    data-testid="editor-canvas"
    @dragover="allowAssetDrop"
    @drop="dropAsset"
  >
    <div v-if="errorMessage" class="canvas-error">{{ errorMessage }}</div>
  </div>
</template>
