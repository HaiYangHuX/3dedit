import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/** 保存可序列化文档；Three.js Scene 和 Object3D 由 EditorEngine 独立持有。 */
export const useDocumentStore = defineStore('document', () => {
  const document = ref(
    createDefaultSceneDocument('local-project', 'local-scene', '场景一'),
  );

  return { document };
});
