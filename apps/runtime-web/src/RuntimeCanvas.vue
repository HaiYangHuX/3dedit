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
      error instanceof Error ? error.message : '三维场景初始化失败';
  }
});

// 运行时与编辑器共用同一资源所有权边界，路由切换时必须一次性释放 RAF、Observer 和 GPU 资源。
onBeforeUnmount(() => engine.dispose());
</script>

<template>
  <div ref="container" class="runtime-canvas" data-testid="runtime-canvas">
    <div v-if="errorMessage" class="runtime-error">{{ errorMessage }}</div>
  </div>
</template>

<style scoped>
.runtime-canvas {
  position: relative;
  width: 100%;
  height: 100%;
}

.runtime-error {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  padding: 12px 18px;
  color: #fecaca;
  background: rgb(127 29 29 / 80%);
  border-radius: 6px;
  transform: translate(-50%, -50%);
}
</style>
