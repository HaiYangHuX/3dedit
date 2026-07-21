import type { Asset } from '@digital-twin/api-contracts';
import {
  AddNodeCommand,
  RemoveNodesCommand,
  ReparentNodeCommand,
  ResetSceneCommand,
  TransformNodesCommand,
  UpdateCameraCommand,
  UpdateCameraRoamingListCommand,
  UpdateNodeCommand,
  UpdateRuntimeConfigCommand,
  UpdateSceneSettingsCommand,
  type EditableNodePatch,
  type EditableCameraPatch,
  type EditableSceneSettingsPatch,
  type RuntimeConfigPatch,
} from '@digital-twin/editor-core';
import type {
  CameraRoamingPath,
  SceneDocument,
  SceneCamera,
  SceneNode,
  Transform,
} from '@digital-twin/scene-schema';
import { createUuid } from '../utils/createUuid';
import type {
  CameraView,
  SelectionState,
  TransformCommit,
} from '@digital-twin/three-engine';
import { toRaw, type Ref } from 'vue';
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
  applyCamera?(camera: SceneCamera): void;
  applyCameraRoamingList?(paths: readonly CameraRoamingPath[]): void;
  startCameraRoamingDrawing?(): boolean;
  cancelCameraRoamingDrawing?(): void;
  previewCameraRoaming?(pathId: string): boolean;
  stopCameraRoaming?(): void;
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
  // Three 场景同步可能跨越多个 microtask；历史操作必须串行，避免连续 keydown
  // 让同一个游标被并发递减，最终出现“跳步”或文档与画布不一致。
  let historyOperation: Promise<void> | undefined;

  function syncCanvasSelection(): void {
    canvas.value?.setSelection(selectionStore.ids, selectionStore.primaryId);
  }

  function select(selection: SelectionState): void {
    selectionStore.set(selection);
    syncCanvasSelection();
  }

  /**
   * Engine 已经完成射线选择和 BoxHelper 更新，此入口只同步响应式状态。
   * 若再调用 setSelection，大模型会在一次点击内重复计算整棵包围盒。
   */
  function selectFromCanvas(selection: SelectionState): void {
    selectionStore.set(selection);
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

  /**
   * 删除模型的二级 Mesh 部件只更新模型组件的排除路径，不删除整个 SceneNode。
   * 该操作复用 UpdateNodeCommand，因此和其他属性编辑一样可逐步撤销，且仍需显式保存。
   */
  async function removeModelPart(
    nodeId: string,
    partPath: string,
  ): Promise<void> {
    const node = documentStore.document.nodes[nodeId];
    const model = node?.components.find(
      (component) => component.kind === 'model',
    );
    if (!node || model?.kind !== 'model' || !partPath) return;
    const excludedPartPaths = [
      ...new Set([...(model.excludedPartPaths ?? []), partPath]),
    ];
    if (excludedPartPaths.length === (model.excludedPartPaths?.length ?? 0)) {
      return;
    }
    await updateNode(nodeId, {
      components: node.components.map((component) =>
        component.kind === 'model'
          ? { ...component, excludedPartPaths }
          : component,
      ),
    });
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
    copy.id = createUuid();
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

  async function updateCamera(patch: EditableCameraPatch): Promise<void> {
    await documentStore.execute(new UpdateCameraCommand(patch));
    canvas.value?.applyCamera?.(documentStore.document.camera);
  }

  async function replaceCameraRoamingList(
    paths: readonly CameraRoamingPath[],
  ): Promise<void> {
    await documentStore.execute(new UpdateCameraRoamingListCommand(paths));
    canvas.value?.applyCameraRoamingList?.(
      documentStore.document.cameraRoamingList,
    );
  }

  /** Orbit/Gizmo 只更新保存快照；与原站一致，鼠标导航不进入撤销历史。 */
  async function syncCameraFromCanvas(camera: SceneCamera): Promise<void> {
    documentStore.syncCameraSnapshot(camera);
  }

  function startCameraRoamingDrawing(): boolean {
    return canvas.value?.startCameraRoamingDrawing?.() ?? false;
  }

  function cancelCameraRoamingDrawing(): void {
    canvas.value?.cancelCameraRoamingDrawing?.();
  }

  function previewCameraRoaming(pathId: string): boolean {
    return canvas.value?.previewCameraRoaming?.(pathId) ?? false;
  }

  function stopCameraRoaming(): void {
    canvas.value?.stopCameraRoaming?.();
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

  async function syncCanvasAfterHistoryChange(
    previous: SceneDocument,
  ): Promise<void> {
    const next = documentStore.document;
    const bridge = canvas.value;
    if (!bridge) return;

    // 变换、节点属性、Camera 和场景配置都可以直接投影，避免原站式编辑体验中
    // 每次撤销都销毁并重建整个 Three 场景。只有层级/节点集合变化才需要完整重载。
    if (hasHierarchyChange(previous, next)) {
      await bridge.loadDocument(next);
    } else {
      try {
        const settingsChanged = !sameJson(previous.settings, next.settings);
        const cameraChanged = !sameJson(previous.camera, next.camera);
        const roamingChanged = !sameJson(
          previous.cameraRoamingList,
          next.cameraRoamingList,
        );
        const applySettings = bridge.applySceneSettings;
        const applyCamera = bridge.applyCamera;
        const applyRoaming = bridge.applyCameraRoamingList;
        // 可选桥接不存在时不能静默跳过，否则文档已撤销而视口仍显示旧配置。
        if (
          (settingsChanged && !applySettings) ||
          (cameraChanged && !applyCamera) ||
          (roamingChanged && !applyRoaming)
        ) {
          await bridge.loadDocument(next);
          restoreHistorySelection();
          return;
        }

        const removedIds = Object.keys(previous.nodes).filter(
          (id) => !next.nodes[id],
        );
        if (removedIds.length > 0) bridge.applyNodeRemoved(removedIds);

        await Promise.all(
          Object.keys(next.nodes).flatMap((id) => {
            const before = previous.nodes[id];
            const after = next.nodes[id];
            return before && after && !sameJson(before, after)
              ? [bridge.applyNodeUpdated(after)]
              : [];
          }),
        );
        if (settingsChanged) applySettings?.(next.settings);
        if (cameraChanged) applyCamera?.(next.camera);
        if (roamingChanged) applyRoaming?.(next.cameraRoamingList);
      } catch {
        // 增量投影失败时以完整快照兜底，不能让文档和视口停在不同历史步。
        await bridge.loadDocument(next);
      }
    }
    restoreHistorySelection();
  }

  function restoreHistorySelection(): void {
    const ids = selectionStore.ids.filter((id) =>
      Boolean(documentStore.document.nodes[id]),
    );
    const primaryId =
      selectionStore.primaryId && ids.includes(selectionStore.primaryId)
        ? selectionStore.primaryId
        : (ids.at(-1) ?? null);
    selectionStore.set({ ids, primaryId });
    syncCanvasSelection();
  }

  async function undo(): Promise<void> {
    await scheduleHistoryOperation(async () => {
      if (!documentStore.canUndo) return;
      const previous = snapshotDocument(documentStore.document);
      await documentStore.undo();
      await syncCanvasAfterHistoryChange(previous);
    });
  }

  async function redo(): Promise<void> {
    await scheduleHistoryOperation(async () => {
      if (!documentStore.canRedo) return;
      const previous = snapshotDocument(documentStore.document);
      await documentStore.redo();
      await syncCanvasAfterHistoryChange(previous);
    });
  }

  /** 串行排队明确的撤销/重做请求；键盘 repeat 已在入口处过滤。 */
  function scheduleHistoryOperation(
    operation: () => Promise<void>,
  ): Promise<void> {
    const pending = historyOperation
      ? historyOperation.catch(() => undefined).then(operation)
      : operation();
    const guarded = pending.finally(() => {
      if (historyOperation === guarded) historyOperation = undefined;
    });
    historyOperation = guarded;
    return guarded;
  }

  /** 重置后清理业务选中并让 Engine 以完整文档快照重建场景。 */
  async function resetScene(): Promise<void> {
    await documentStore.execute(new ResetSceneCommand());
    selectionStore.clear();
    syncCanvasSelection();
    await canvas.value?.loadDocument(documentStore.document);
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
    // code 在绝大多数浏览器稳定，但旧站和部分测试环境只提供 key；统一成物理按键名称。
    const code = event.code || keyToCode(event.key);
    if (code === 'Escape' && canvas.value?.handleShortcut?.('Escape')) {
      event.preventDefault();
      return;
    }
    const commandModifier = event.metaKey || event.ctrlKey;
    if (commandModifier && code === 'KeyZ') {
      event.preventDefault();
      // 浏览器长按会产生 repeat keydown；原站一次按键只对应一个历史步。
      if (event.repeat) return;
      void (event.shiftKey ? redo() : undo()).catch((reason) =>
        options.onError?.(reason),
      );
      return;
    }
    if (code === 'Delete' || code === 'Backspace') {
      event.preventDefault();
      // 删除是异步命令，长按键的重复事件会在第一条命令完成前再次提交同一节点。
      if (event.repeat) return;
      void removeSelection().catch((reason) => options.onError?.(reason));
      return;
    }
    if (canvas.value?.handleShortcut?.(code)) {
      event.preventDefault();
      return;
    }
    const modes: Partial<Record<string, 'translate' | 'rotate' | 'scale'>> = {
      KeyW: 'translate',
      KeyE: 'rotate',
      KeyR: 'scale',
    };
    const mode = modes[code];
    if (mode) {
      event.preventDefault();
      setTransformMode(mode);
    } else if (code === 'KeyF') {
      event.preventDefault();
      focusSelection();
    }
  }

  return {
    select,
    selectFromCanvas,
    addAssetNode,
    addGeometry,
    addLight,
    removeNodes,
    removeSelection,
    updateNode,
    updateSelection,
    removeModelPart,
    reparentNode,
    duplicateNode,
    groupNodes,
    updateSceneSettings,
    updateCamera,
    replaceCameraRoamingList,
    syncCameraFromCanvas,
    startCameraRoamingDrawing,
    cancelCameraRoamingDrawing,
    previewCameraRoaming,
    stopCameraRoaming,
    updateRuntimeConfig,
    commitTransform,
    resetScene,
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

function keyToCode(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized.length === 1 && normalized >= 'a' && normalized <= 'z') {
    return `Key${normalized.toUpperCase()}`;
  }
  return key;
}

function snapshotDocument(document: SceneDocument): SceneDocument {
  // Pinia 可能返回 Proxy；历史比较必须基于独立 JSON 快照，不能被后续命令原地修改。
  return structuredClone(toRaw(document));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasHierarchyChange(
  previous: SceneDocument,
  next: SceneDocument,
): boolean {
  if (!sameJson(previous.rootNodeIds, next.rootNodeIds)) return true;
  const ids = new Set([
    ...Object.keys(previous.nodes),
    ...Object.keys(next.nodes),
  ]);
  for (const id of ids) {
    const before = previous.nodes[id];
    const after = next.nodes[id];
    if (!before || !after) return true;
    if (
      before.parentId !== after.parentId ||
      !sameJson(before.childIds, after.childIds)
    ) {
      return true;
    }
  }
  return false;
}
