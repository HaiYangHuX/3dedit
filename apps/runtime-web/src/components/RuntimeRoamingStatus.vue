<script setup lang="ts">
defineEmits<{ stop: [] }>();
</script>

<template>
  <div class="runtime-roaming-status" role="status">
    <strong>漫游中..</strong>
    <button type="button" aria-label="取消相机漫游" @click="$emit('stop')">
      取消
    </button>
  </div>
</template>

<style scoped>
.runtime-roaming-status {
  position: absolute;
  top: 60px;
  left: 50%;
  z-index: 1000;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 5px 9px;
  color: #f8fafc;
  font:
    11px/1.4 Inter,
    system-ui,
    sans-serif;
  background: rgb(11 15 25 / 88%);
  border: 1px solid rgb(56 189 248 / 25%);
  border-radius: 5px;
  transform: translateX(-50%);
  backdrop-filter: blur(8px);
}

.runtime-roaming-status button {
  padding: 2px 6px;
  color: #fca5a5;
  background: transparent;
  border: 1px solid rgb(248 113 113 / 35%);
  border-radius: 3px;
  cursor: pointer;
}
</style>
