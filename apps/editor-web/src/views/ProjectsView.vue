<script setup lang="ts">
import { ElButton, ElCard } from 'element-plus';
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="management-page">
    <header>
      <h1>项目管理</h1>
      <ElButton type="primary">创建项目</ElButton>
    </header>
    <ElCard class="project-card">
      <h2>示例项目</h2>
      <p>用于验证编辑器基础链路。</p>
      <RouterLink to="/editor/local-project/local-scene">进入编辑器</RouterLink>
    </ElCard>
  </main>
</template>
