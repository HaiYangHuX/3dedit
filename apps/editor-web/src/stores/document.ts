import {
  createDefaultSceneDocument,
  type SceneDocument,
} from '@digital-twin/scene-schema';
import {
  CommandHistory,
  type EditorCommand,
  type EditorDocumentContext,
} from '@digital-twin/editor-core';
import { defineStore } from 'pinia';
import { ref, toRaw, triggerRef } from 'vue';
import { ApiError } from '../api/client';
import { projectApi } from '../api/projects';

export type SaveState =
  'idle' | 'loading' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

const AUTO_SAVE_DELAY = 1_500;

/**
 * 保存可序列化文档和明确的保存状态机；Three.js Scene 和 Object3D 由 EditorEngine 独立持有。
 * 加载代次防止路由快速切换时的迟到响应覆盖新场景。
 */
export const useDocumentStore = defineStore('document', () => {
  const document = ref<SceneDocument>(
    createDefaultSceneDocument('local-project', 'local-scene', '场景一'),
  );
  const activeSceneId = ref('');
  const saveState = ref<SaveState>('idle');
  const error = ref('');
  const canUndo = ref(false);
  const canRedo = ref(false);
  const isHistoryDirty = ref(false);
  let loadGeneration = 0;
  let changeGeneration = 0;
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let activeSave: Promise<void> | undefined;
  let changedDuringSave = false;
  let history: CommandHistory<EditorDocumentContext>;

  function syncHistoryState(): void {
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
    isHistoryDirty.value = history.isDirty;
    // 撤销回最后一次保存游标时，无需再发起一次内容相同的自动保存。
    if (!history.isDirty && saveState.value === 'dirty') {
      clearAutoSaveTimer();
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

  function clearAutoSaveTimer(): void {
    if (!autoSaveTimer) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = undefined;
  }

  async function loadScene(sceneId: string): Promise<void> {
    const generation = ++loadGeneration;
    clearAutoSaveTimer();
    activeSceneId.value = sceneId;
    saveState.value = 'loading';
    error.value = '';
    try {
      const scene = await projectApi.getScene(sceneId);
      if (generation !== loadGeneration) return;
      document.value = structuredClone(scene.document);
      resetHistory();
      changeGeneration = 0;
      changedDuringSave = false;
      saveState.value = 'saved';
    } catch (reason) {
      if (generation !== loadGeneration) return;
      saveState.value = 'error';
      error.value =
        reason instanceof ApiError ? reason.message : '场景加载失败';
      throw reason;
    }
  }

  function scheduleAutoSave(delay = AUTO_SAVE_DELAY): void {
    clearAutoSaveTimer();
    if (!activeSceneId.value || saveState.value === 'conflict') return;
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = undefined;
      void save().catch(() => {
        // 自动保存错误已进入 Store 状态，这里防止产生未处理 Promise。
      });
    }, delay);
  }

  function markDirty(): void {
    // 命令直接修改原始文档，在单一出口处通知 Vue 刷新场景树和属性面板。
    triggerRef(document);
    changeGeneration += 1;
    if (saveState.value === 'saving') {
      changedDuringSave = true;
    } else {
      saveState.value = 'dirty';
    }
    scheduleAutoSave();
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

  function markSaved(): void {
    history.markSaved();
    syncHistoryState();
  }

  async function performSave(): Promise<void> {
    const sceneId = activeSceneId.value;
    if (!sceneId)
      throw new ApiError(0, 'NO_ACTIVE_SCENE', '当前没有可保存的场景');
    clearAutoSaveTimer();
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
        markSaved();
        saveState.value = 'saved';
      } else {
        // 保存期间的本地编辑不能被服务端响应覆盖，只继承新 revision 再排队保存。
        document.value.revision = scene.document.revision;
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
      if (
        saveState.value === 'dirty' ||
        (changedDuringSave && saveState.value !== 'conflict')
      ) {
        saveState.value = 'dirty';
        scheduleAutoSave(0);
      }
    }
  }

  function save(): Promise<void> {
    if (activeSave) return activeSave;
    activeSave = performSave();
    return activeSave;
  }

  function disposeAutoSave(): void {
    clearAutoSaveTimer();
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
    loadScene,
    markDirty,
    execute,
    undo,
    redo,
    markSaved,
    scheduleAutoSave,
    save,
    disposeAutoSave,
  };
});
