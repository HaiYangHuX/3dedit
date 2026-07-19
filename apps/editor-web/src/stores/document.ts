import {
  createDefaultSceneDocument,
  type SceneCamera,
  type SceneDocument,
} from '@digital-twin/scene-schema';
import {
  CommandHistory,
  type EditorCommand,
  type EditorDocumentContext,
} from '@digital-twin/editor-core';
import { defineStore } from 'pinia';
import { ref, shallowRef, toRaw, triggerRef } from 'vue';
import { ApiError } from '../api/client';
import { projectApi } from '../api/projects';

export type SaveState =
  'idle' | 'loading' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

/**
 * 保存可序列化文档和明确的保存状态机；Three.js Scene 和 Object3D 由 EditorEngine 独立持有。
 * 加载代次防止路由快速切换时的迟到响应覆盖新场景。
 */
export const useDocumentStore = defineStore('document', () => {
  // 场景文档包含递归条件树，shallowRef 同时避免 Vue 深层解包递归类型和无意义的整树代理。
  const document = shallowRef<SceneDocument>(
    createDefaultSceneDocument('local-project', 'local-scene', '场景一'),
  );
  const activeSceneId = ref('');
  const saveState = ref<SaveState>('idle');
  const error = ref('');
  const canUndo = ref(false);
  const canRedo = ref(false);
  const isHistoryDirty = ref(false);
  // CommandHistory 必须持有稳定的原始文档对象，子组件通过此代次感知原地变更。
  const documentChangeVersion = ref(0);
  let loadGeneration = 0;
  let changeGeneration = 0;
  let activeSave: Promise<void> | undefined;
  let changedDuringSave = false;
  // OrbitControls 导航需要进入保存快照，但按原站规则不进入 CommandHistory。
  let hasNonHistoryChanges = false;
  let history: CommandHistory<EditorDocumentContext>;

  function syncHistoryState(): void {
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
    isHistoryDirty.value = history.isDirty;
    // 撤销回最后一次保存游标时，当前文档已与服务端一致，不再显示未保存状态。
    if (
      !history.isDirty &&
      !hasNonHistoryChanges &&
      saveState.value === 'dirty'
    ) {
      saveState.value = 'saved';
    }
  }

  function resetHistory(): void {
    history = new CommandHistory<EditorDocumentContext>({
      // editor-core 不依赖 Vue，命令快照会使用 structuredClone，因此边界上不能传入 Proxy。
      document: toRaw(document.value),
      onChanged: markDirty,
    });
    syncHistoryState();
  }

  async function loadScene(sceneId: string): Promise<void> {
    const generation = ++loadGeneration;
    activeSceneId.value = sceneId;
    saveState.value = 'loading';
    error.value = '';
    try {
      const scene = await projectApi.getScene(sceneId);
      if (generation !== loadGeneration) return;
      document.value = structuredClone(scene.document);
      documentChangeVersion.value += 1;
      resetHistory();
      changeGeneration = 0;
      changedDuringSave = false;
      hasNonHistoryChanges = false;
      saveState.value = 'saved';
    } catch (reason) {
      if (generation !== loadGeneration) return;
      saveState.value = 'error';
      error.value =
        reason instanceof ApiError ? reason.message : '场景加载失败';
      throw reason;
    }
  }

  function markDirty(): void {
    // 命令直接修改原始文档，在单一出口处通知 Vue 刷新场景树和属性面板。
    documentChangeVersion.value += 1;
    triggerRef(document);
    changeGeneration += 1;
    if (saveState.value === 'saving') {
      changedDuringSave = true;
    } else {
      saveState.value = 'dirty';
    }
  }

  async function execute(
    command: EditorCommand<EditorDocumentContext>,
  ): Promise<void> {
    try {
      await history.execute(command);
    } finally {
      syncHistoryState();
    }
  }

  async function undo(): Promise<void> {
    try {
      await history.undo();
    } finally {
      syncHistoryState();
    }
  }

  async function redo(): Promise<void> {
    try {
      await history.redo();
    } finally {
      syncHistoryState();
    }
  }

  /**
   * 鼠标导航只同步下次保存所需的 Camera 快照，不占用撤销步骤。
   * 显式修改 Camera 属性仍通过 UpdateCameraCommand 进入历史。
   */
  function syncCameraSnapshot(camera: SceneCamera): void {
    if (JSON.stringify(document.value.camera) === JSON.stringify(camera)) {
      return;
    }
    Object.assign(document.value.camera, structuredClone(camera));
    hasNonHistoryChanges = true;
    markDirty();
  }

  function markSaved(): void {
    hasNonHistoryChanges = false;
    history.markSaved();
    syncHistoryState();
  }

  async function performSave(): Promise<void> {
    const sceneId = activeSceneId.value;
    if (!sceneId)
      throw new ApiError(0, 'NO_ACTIVE_SCENE', '当前没有可保存的场景');
    const generation = changeGeneration;
    // Vue 深度响应式对象是 Proxy，必须取回原始 JSON 对象后才能 structuredClone。
    const snapshot = structuredClone(toRaw(document.value));
    changedDuringSave = false;
    saveState.value = 'saving';
    error.value = '';

    try {
      const scene = await projectApi.saveScene(sceneId, {
        baseRevision: snapshot.revision,
        document: snapshot,
      });
      if (sceneId !== activeSceneId.value) return;

      if (changeGeneration === generation) {
        // 保持根文档对象身份，否则 CommandHistory 上下文会继续指向已被替换的旧快照。
        Object.assign(document.value, structuredClone(scene.document));
        documentChangeVersion.value += 1;
        markSaved();
        saveState.value = 'saved';
      } else {
        // 保存期间的本地编辑不能被服务端响应覆盖，只继承新 revision 再排队保存。
        document.value.revision = scene.document.revision;
        documentChangeVersion.value += 1;
        saveState.value = 'dirty';
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        saveState.value = 'conflict';
      } else {
        saveState.value = 'error';
      }
      error.value =
        reason instanceof ApiError ? reason.message : '场景保存失败';
      throw reason;
    } finally {
      activeSave = undefined;
      // 保存期间的编辑只能等待用户再次点击“保存”，不能在后台自动提交。
      if (
        saveState.value === 'dirty' ||
        (changedDuringSave && saveState.value !== 'conflict')
      ) {
        saveState.value = 'dirty';
      }
    }
  }

  function save(): Promise<void> {
    if (activeSave) return activeSave;
    activeSave = performSave();
    return activeSave;
  }

  function dispose(): void {
    // 不能中止 fetch 时通过代次使迟到加载结果失效。
    loadGeneration += 1;
  }

  resetHistory();

  return {
    document,
    activeSceneId,
    saveState,
    error,
    canUndo,
    canRedo,
    isHistoryDirty,
    documentChangeVersion,
    loadScene,
    markDirty,
    execute,
    undo,
    redo,
    syncCameraSnapshot,
    markSaved,
    save,
    dispose,
  };
});
