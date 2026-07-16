import type { Asset } from '@digital-twin/api-contracts';
import {
  AddNodeCommand,
  RemoveNodesCommand,
  TransformNodesCommand,
  UpdateNodeCommand,
  type EditableNodePatch,
} from '@digital-twin/editor-core';
import type {
  SceneDocument,
  SceneNode,
  Transform,
} from '@digital-twin/scene-schema';
import type {
  SelectionState,
  TransformCommit,
} from '@digital-twin/three-engine';
import type { Ref } from 'vue';
import {
  createAssetNode,
  createGeometryNode,
  createLightNode,
  type GeometryPrimitive,
  type SceneLightType,
} from './createSceneNode';
import { useDocumentStore } from '../stores/document';
import { useSelectionStore } from '../stores/selection';

export interface EditorCanvasBridge {
  loadDocument(document?: SceneDocument): Promise<void>;
  applyNodeAdded(node: SceneNode): Promise<void>;
  applyNodeRemoved(ids: Iterable<string>): void;
  applyNodeUpdated(node: SceneNode): void;
  setSelection(ids: Iterable<string>, primaryId?: string | null): void;
  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void;
  setTransformSpace?(space: 'local' | 'world'): void;
  focusSelection(): boolean;
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
  }

  async function addNode(node: SceneNode): Promise<SceneNode> {
    await documentStore.execute(new AddNodeCommand(node));
    await canvas.value?.applyNodeAdded(node);
    selectionStore.set({ ids: [node.id], primaryId: node.id });
    syncCanvasSelection();
    return node;
  }

  function addAssetNode(
    asset: Pick<Asset, 'id' | 'name'>,
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

  async function removeSelection(): Promise<void> {
    const ids = [...selectionStore.ids];
    if (ids.length === 0) return;
    await documentStore.execute(new RemoveNodesCommand(ids));
    canvas.value?.applyNodeRemoved(ids);
    selectionStore.clear();
    syncCanvasSelection();
  }

  async function updateSelection(patch: EditableNodePatch): Promise<void> {
    const nodeId = selectionStore.primaryId;
    if (!nodeId) return;
    await documentStore.execute(new UpdateNodeCommand(nodeId, patch));
    const node = documentStore.document.nodes[nodeId];
    if (node) canvas.value?.applyNodeUpdated(node);
  }

  async function commitTransform(commit: TransformCommit): Promise<void> {
    await documentStore.execute(
      new TransformNodesCommand([
        { id: commit.nodeId, before: commit.before, after: commit.after },
      ]),
    );
    const node = documentStore.document.nodes[commit.nodeId];
    if (node) canvas.value?.applyNodeUpdated(node);
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

  function focusSelection(): void {
    canvas.value?.focusSelection();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;
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
    removeSelection,
    updateSelection,
    commitTransform,
    undo,
    redo,
    setTransformMode,
    focusSelection,
    handleKeydown,
  };
}
