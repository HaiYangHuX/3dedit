<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), {
  text: '首次加载需要较长时间，请耐心等待...',
});
</script>

<template>
  <div class="runtime-loading-overlay" role="status" aria-live="polite">
    <span class="runtime-loading-spinner" aria-hidden="true"></span>
    <strong>{{ text }}</strong>
  </div>
</template>

<style scoped>
.runtime-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2000;
  display: grid;
  gap: 12px;
  place-content: center;
  justify-items: center;
  color: #cbd5e1;
  font:
    12px/1.5 Inter,
    system-ui,
    sans-serif;
  background: #070a13;
}

.runtime-loading-spinner {
  width: 34px;
  height: 34px;
  border: 2px solid rgb(56 189 248 / 18%);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: runtime-spin 0.9s linear infinite;
}

@keyframes runtime-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
