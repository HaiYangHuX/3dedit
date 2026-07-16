<script setup lang="ts">
import RuntimeCanvas from './RuntimeCanvas.vue';
</script>

<template>
  <main class="runtime-shell">
    <RuntimeCanvas />
  </main>
</template>

<style>
html,
body,
#app,
.runtime-shell {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body {
  background: #111827;
}
</style>
