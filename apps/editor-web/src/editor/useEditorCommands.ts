import type { Asset } from '@digital-twin/api-contracts';
import {
  AddNodeCommand,
  RemoveNodesCommand,
  ReparentNodeCommand,
  TransformNodesCommand,
  UpdateNodeCommand,
  UpdateRuntimeConfigCommand,
  UpdateSceneSettingsCommand,
  type EditableNodePatch,
  type EditableSceneSettingsPatch,
  type RuntimeConfigPatch,
} from '@digital-twin/editor-core';
import type {
  SceneDocument,
  SceneNode,
  Transform,
} from '@digital-twin/scene-schema';
import type {
  CameraView,
  SelectionState,
  TransformCommit,
} from '@digital-twin/three-engine';
import type { Ref } from 'vue';
import {
  createAssetNode,
  createGeometryNode,
  createLightNode,
  createSceneNode,
  MODEL_INSTANCE_NAME_VERSION_KEY,
  type GeometryPrimitive,
  type SceneLightType,
} from './createSceneNode';
import { useDocumentStore } from '../stores/document';
import { useSelectionStore } from '../stores/selection';

export interface EditorCanvasBridge {
  loadDocument(document?: SceneDocument): Promise<void>;
  applyNodeAdded(node: SceneNode): Promise<void>;
  applyNodeRemoved(ids: Iterable<string>): void;
  applyNodeUpdated(node: SceneNode): Promise<void>;
  applySceneSettings?(settings: SceneDocument['settings']): void;
  setSelection(ids: Iterable<string>, primaryId?: string | null): void;
  selectModelPart?(nodeId: string, objectId: string): boolean;
  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void;
  setTransformSpace?(space: 'local' | 'world'): void;
  handleShortcut?(code: string): boolean;
  togglePointerLock?(): boolean;
  setMeasurementEnabled?(enabled: boolean): boolean;
  setSelectWholeModel?(enabled: boolean): void;
  alignModelsToGround?(): TransformCommit[];
  focusSelection(): boolean;
  setCameraView?(view: CameraView): void;
  resetCamera?(): void;
  captureScreenshot?(): Promise<Blob>;
}

export interface UseEditorCommandOptions {
  onError?(reason: unknown): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** 组合文档命令、选择 Store 和 Three 桥接，视图只负责把 UI 意图传入。 */
export function useEditorCommands(
  canvas: Ref<EditorCanvasBridge | null | undefined>,
  options: UseEditorCommandOptions = {},
) {
  const documentStore = useDocumentStore();
  const selectionStore = useSelectionStore();

  function syncCanvasSelection(): void {
    canvas.value?.setSelection(selectionStore.ids, selectionStore.primaryId);
  }

  function select(selection: SelectionState): void {
    selectionStore.set(selection);
    syncCanvasSelection();
  }

  async function addNode(node: SceneNode): Promise<SceneNode> {
    await documentStore.execute(new AddNodeCommand(node));
    await canvas.value?.applyNodeAdded(node);
    selectionStore.set({ ids: [node.id], primaryId: node.id });
    syncCanvasSelection();
    return node;
  }

  function addAssetNode(
    asset: Pick<Asset, 'id' | 'name' | 'format'>,
    position: Transform['position'],
  ): Promise<SceneNode> {
    return addNode(createAssetNode(asset, position));
  }

  function addGeometry(
    primitive: GeometryPrimitive,
    position: Transform['position'] = [0, 0, 0],
  ): Promise<SceneNode> {
    return addNode(createGeometryNode(primitive, position));
  }

  function addLight(
    lightType: SceneLightType,
    position: Transform['position'] = [0, 0, 0],
  ): Promise<SceneNode> {
    return addNode(createLightNode(lightType, position));
  }

  async function removeNodes(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await documentStore.execute(new RemoveNodesCommand(ids));
    canvas.value?.applyNodeRemoved(ids);
    selectionStore.clear();
    syncCanvasSelection();
  }

  function removeSelection(): Promise<void> {
    return removeNodes([...selectionStore.ids]);
  }

  async function updateNode(
    nodeId: string,
    patch: EditableNodePatch,
  ): Promise<void> {
    const current = documentStore.document.nodes[nodeId];
    const isModel = current?.components.some(
      (component) => component.kind === 'model',
    );
    const nextPatch =
      patch.name !== undefined && current && isModel
        ? {
            ...patch,
            businessData: {
              ...current.businessData,
              ...patch.businessData,
              [MODEL_INSTANCE_NAME_VERSION_KEY]: 1,
            },
          }
        : patch;
    await documentStore.execute(new UpdateNodeCommand(nodeId, nextPatch));
    const node = documentStore.document.nodes[nodeId];
    if (node) await canvas.value?.applyNodeUpdated(node);
  }

  async function updateSelection(patch: EditableNodePatch): Promise<void> {
    const nodeId = selectionStore.primaryId;
    if (!nodeId) return;
    await updateNode(nodeId, patch);
  }

  async function reparentNode(
    nodeId: string,
    parentId: string | null,
    index: number,
  ): Promise<void> {
    await documentStore.execute(
      new ReparentNodeCommand(nodeId, parentId, index),
    );
    // SceneDocumentSystem 恢复层级时会保持模型模板缓存，这里优先保证父子矩阵正确。
    await canvas.value?.loadDocument(documentStore.document);
  }

  async function duplicateNode(nodeId: string): Promise<SceneNode> {
    const source = documentStore.document.nodes[nodeId];
    if (!source) throw new Error(`节点不存在: ${nodeId}`);
    // 属性协议是 JSON，显式换新 ID 并移除子级，避免复制单节点时引入悬空 childIds。
    const copy = JSON.parse(JSON.stringify(source)) as SceneNode;
    copy.id = globalThis.crypto.randomUUID();
    copy.name = `${source.name} 副本`;
    copy.childIds = [];
    return addNode(copy);
  }

  async function groupNodes(nodeIds: string[]): Promise<SceneNode> {
    const nodes = [...new Set(nodeIds)].flatMap((id) => {
      const node = documentStore.document.nodes[id];
      return node ? [node] : [];
    });
    if (nodes.length === 0) throw new Error('没有可组合的节点');
    const parentId = nodes[0]?.parentId ?? null;
    if (nodes.some((node) => node.parentId !== parentId)) {
      throw new Error('只能组合位于同一层级的节点');
    }
    const group = createSceneNode('组', [], { parentId });
    await addNode(group);
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) continue;
      await documentStore.execute(
        new ReparentNodeCommand(node.id, group.id, index),
      );
    }
    await canvas.value?.loadDocument(documentStore.document);
    selectionStore.set({ ids: [group.id], primaryId: group.id });
    syncCanvasSelection();
    return documentStore.document.nodes[group.id] ?? group;
  }

  async function updateSceneSettings(
    patch: EditableSceneSettingsPatch,
  ): Promise<void> {
    await documentStore.execute(new UpdateSceneSettingsCommand(patch));
    canvas.value?.applySceneSettings?.(documentStore.document.settings);
  }

  async function updateRuntimeConfig(patch: RuntimeConfigPatch): Promise<void> {
    await documentStore.execute(new UpdateRuntimeConfigCommand(patch));
  }

  async function commitTransform(commit: TransformCommit): Promise<void> {
    await documentStore.execute(
      new TransformNodesCommand([
        { id: commit.nodeId, before: commit.before, after: commit.after },
      ]),
    );
    const node = documentStore.document.nodes[commit.nodeId];
    if (node) await canvas.value?.applyNodeUpdated(node);
  }

  async function reloadCanvasAfterHistoryChange(): Promise<void> {
    selectionStore.clear();
    await canvas.value?.loadDocument(documentStore.document);
  }

  async function undo(): Promise<void> {
    if (!documentStore.canUndo) return;
    await documentStore.undo();
    await reloadCanvasAfterHistoryChange();
  }

  async function redo(): Promise<void> {
    if (!documentStore.canRedo) return;
    await documentStore.redo();
    await reloadCanvasAfterHistoryChange();
  }

  function setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    canvas.value?.setTransformMode(mode);
  }

  async function alignModelsToGround(): Promise<void> {
    const changes = canvas.value?.alignModelsToGround?.() ?? [];
    if (changes.length === 0) return;
    await documentStore.execute(
      new TransformNodesCommand(
        changes.map(({ nodeId, before, after }) => ({
          id: nodeId,
          before,
          after,
        })),
      ),
    );
    await Promise.all(
      changes.map(async (change) => {
        const node = documentStore.document.nodes[change.nodeId];
        if (node) await canvas.value?.applyNodeUpdated(node);
      }),
    );
  }

  function togglePointerLock(): boolean {
    return canvas.value?.togglePointerLock?.() ?? false;
  }

  function setMeasurementEnabled(enabled: boolean): boolean {
    return canvas.value?.setMeasurementEnabled?.(enabled) ?? false;
  }

  function setSelectWholeModel(enabled: boolean): void {
    canvas.value?.setSelectWholeModel?.(enabled);
  }

  function focusSelection(): void {
    canvas.value?.focusSelection();
  }

  function setCameraView(view: CameraView): void {
    canvas.value?.setCameraView?.(view);
  }

  function resetCamera(): void {
    canvas.value?.resetCamera?.();
  }

  function captureScreenshot(): Promise<Blob> {
    const operation = canvas.value?.captureScreenshot?.();
    return operation ?? Promise.reject(new Error('三维视口尚未就绪'));
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;
    if (event.code === 'Escape' && canvas.value?.handleShortcut?.('Escape')) {
      event.preventDefault();
      return;
    }
    const commandModifier = event.metaKey || event.ctrlKey;
    if (commandModifier && event.code === 'KeyZ') {
      event.preventDefault();
      void (event.shiftKey ? redo() : undo()).catch((reason) =>
        options.onError?.(reason),
      );
      return;
    }
    if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      void removeSelection().catch((reason) => options.onError?.(reason));
      return;
    }
    const modes: Partial<Record<string, 'translate' | 'rotate' | 'scale'>> = {
      KeyW: 'translate',
      KeyE: 'rotate',
      KeyR: 'scale',
    };
    const mode = modes[event.code];
    if (mode) {
      event.preventDefault();
      setTransformMode(mode);
    } else if (event.code === 'KeyF') {
      event.preventDefault();
      focusSelection();
    }
  }

  return {
    select,
    addAssetNode,
    addGeometry,
    addLight,
    removeNodes,
    removeSelection,
    updateNode,
    updateSelection,
    reparentNode,
    duplicateNode,
    groupNodes,
    updateSceneSettings,
    updateRuntimeConfig,
    commitTransform,
    undo,
    redo,
    setTransformMode,
    alignModelsToGround,
    togglePointerLock,
    setMeasurementEnabled,
    setSelectWholeModel,
    focusSelection,
    setCameraView,
    resetCamera,
    captureScreenshot,
    handleKeydown,
  };
}
