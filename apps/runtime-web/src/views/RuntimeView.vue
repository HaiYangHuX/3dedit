<script setup lang="ts">
import type { SceneDocument } from '@digital-twin/scene-schema';
import type { AssetResolver } from '@digital-twin/three-engine';
import { computed, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import RuntimeCanvas from '../RuntimeCanvas.vue';
import { runtimeApi } from '../api/runtime.js';
import {
  createPreviewAssetResolver,
  createPublicationAssetResolver,
} from '../runtime/runtimeAssetResolver.js';

const route = useRoute();
const document = shallowRef<SceneDocument>();
const resolver = shallowRef<AssetResolver>();
const loading = ref(true);
const errorMessage = ref('');
let generation = 0;

const mode = computed<'preview' | 'runtime'>(() =>
  route.name === 'preview' ? 'preview' : 'runtime',
);

watch(
  () => route.fullPath,
  async () => {
    const currentGeneration = ++generation;
    document.value = undefined;
    resolver.value = undefined;
    loading.value = true;
    errorMessage.value = '';
    try {
      if (mode.value === 'preview') {
        const sceneId = String(route.params.sceneId ?? '');
        const scene = await runtimeApi.getPreviewScene(sceneId);
        if (currentGeneration !== generation) return;
        document.value = scene.document;
        resolver.value = createPreviewAssetResolver(runtimeApi);
      } else {
        const publicationId = String(route.params.publicationId ?? '');
        const manifest = await runtimeApi.getPublicationManifest(publicationId);
        if (currentGeneration !== generation) return;
        document.value = manifest.document;
        resolver.value = createPublicationAssetResolver(manifest.assets);
      }
    } catch (error) {
      if (currentGeneration !== generation) return;
      errorMessage.value =
        error instanceof Error ? error.message : '运行时场景加载失败';
    } finally {
      if (currentGeneration === generation) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <main class="runtime-view" :data-runtime-page-mode="mode">
    <RuntimeCanvas
      v-if="document && resolver"
      :document="document"
      :resolver="resolver"
      :mode="mode"
    />
    <div v-else-if="loading" class="runtime-state">正在加载三维场景…</div>
    <div v-else class="runtime-state runtime-state--error">
      {{ errorMessage || '场景不可用' }}
    </div>
  </main>
</template>

<style scoped>
.runtime-view {
  width: 100%;
  height: 100%;
  background: #070a13;
}

.runtime-state {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: #94a3b8;
  font:
    13px/1.5 Inter,
    system-ui,
    sans-serif;
}

.runtime-state--error {
  color: #fca5a5;
}
</style>
