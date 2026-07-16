<script setup lang="ts">
defineProps<{ entries: string[] }>();
</script>

<template>
  <ol v-if="entries.length" class="editor-runtime-diagnostics">
    <li v-for="(entry, index) in entries" :key="`${index}-${entry}`">
      {{ entry }}
    </li>
  </ol>
</template>
