import {
  SelectionModel,
  type SelectionSnapshot,
} from '@digital-twin/editor-core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** 给 Vue 面板提供响应式选择状态，选择语义仍由无框架 SelectionModel 统一维护。 */
export const useSelectionStore = defineStore('selection', () => {
  const model = new SelectionModel();
  const ids = ref<string[]>([]);
  const primaryId = ref<string | null>(null);

  model.subscribe((selection) => {
    ids.value = selection.ids;
    primaryId.value = selection.primaryId;
  });

  function set(selection: SelectionSnapshot): void {
    model.set(selection.ids, selection.primaryId ?? undefined);
  }

  function toggle(id: string): void {
    model.toggle(id);
  }

  function remove(removing: Iterable<string>): void {
    model.remove(removing);
  }

  function clear(): void {
    model.clear();
  }

  return { ids, primaryId, set, toggle, remove, clear };
});
