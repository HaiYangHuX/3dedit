<script setup lang="ts">
import type { EditableSceneSettingsPatch } from '@digital-twin/editor-core';
import type { SceneDocument } from '@digital-twin/scene-schema';
import { ref, watch } from 'vue';

const props = defineProps<{ settings: SceneDocument['settings'] }>();
const emit = defineEmits<{ update: [patch: EditableSceneSettingsPatch] }>();
const exposureDraft = ref(1);
const environmentDraft = ref('');

watch(
  () => props.settings,
  (settings) => {
    exposureDraft.value = settings.exposure;
    environmentDraft.value = settings.environmentAssetId ?? '';
  },
  { immediate: true, deep: true },
);

function commitExposure(): void {
  if (!Number.isFinite(exposureDraft.value) || exposureDraft.value <= 0) return;
  if (exposureDraft.value !== props.settings.exposure) {
    emit('update', { exposure: exposureDraft.value });
  }
}

function commitEnvironment(): void {
  const environmentAssetId = environmentDraft.value.trim() || null;
  if (environmentAssetId !== props.settings.environmentAssetId) {
    emit('update', { environmentAssetId });
  }
}
</script>

<template>
  <section class="scene-settings-inspector" data-testid="scene-settings">
    <header class="inspector-title"><strong>场景设置</strong></header>
    <div class="inspector-field">
      <label for="scene-background">背景色</label>
      <input
        id="scene-background"
        type="color"
        :value="settings.background"
        @change="
          emit('update', {
            background: ($event.target as HTMLInputElement).value,
          })
        "
      />
    </div>
    <div class="inspector-field">
      <label for="scene-exposure">曝光</label>
      <input
        id="scene-exposure"
        v-model.number="exposureDraft"
        type="number"
        min="0.01"
        step="0.1"
        @change="commitExposure"
      />
    </div>
    <label class="inspector-checkbox">
      <input
        type="checkbox"
        :checked="settings.gridVisible"
        @change="
          emit('update', {
            gridVisible: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      显示地面网格
    </label>
    <div class="inspector-field inspector-field--stacked">
      <label for="environment-asset">环境 HDR 资源 ID</label>
      <input
        id="environment-asset"
        v-model="environmentDraft"
        placeholder="未设置"
        @change="commitEnvironment"
      />
      <small>环境贴图将从模型库资源中解析。</small>
    </div>
  </section>
</template>
