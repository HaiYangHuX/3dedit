<script setup lang="ts">
import { EditorEngine } from '@digital-twin/three-engine';
import { onBeforeUnmount, onMounted, ref } from 'vue';

const container = ref<HTMLDivElement>();
const errorMessage = ref('');
const engine = new EditorEngine();

onMounted(async () => {
  if (!container.value) return;
  try {
    await engine.initialize(container.value);
    container.value.dataset.engineReady = 'true';
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '三维视口初始化失败';
  }
});

// EditorEngine 统一拥有 RAF、ResizeObserver、Composer 和 GPU 资源。
onBeforeUnmount(() => engine.dispose());
</script>

<template>
  <div ref="container" class="editor-canvas" data-testid="editor-canvas">
    <div v-if="errorMessage" class="canvas-error">{{ errorMessage }}</div>
  </div>
</template>
