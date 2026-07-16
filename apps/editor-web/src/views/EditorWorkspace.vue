<script setup lang="ts">
import { ElButton, ElButtonGroup } from 'element-plus';
import EditorCanvas from '../components/EditorCanvas.vue';
</script>

<template>
  <main class="editor-workspace">
    <header class="top-toolbar" data-testid="top-toolbar">
      <div class="brand-block">
        <span class="brand-dot" />
        <strong>数字孪生场景平台</strong>
        <span class="scene-name">场景一</span>
      </div>
      <ElButtonGroup>
        <ElButton size="small">撤销</ElButton>
        <ElButton size="small">重做</ElButton>
        <ElButton size="small">保存</ElButton>
        <ElButton size="small">预览</ElButton>
        <ElButton type="primary" size="small">发布</ElButton>
      </ElButtonGroup>
    </header>

    <aside class="asset-panel" data-testid="asset-panel">
      <h2>场景元素</h2>
      <nav class="asset-categories">
        <button type="button" class="active">模型</button>
        <button type="button">几何体</button>
        <button type="button">灯光</button>
        <button type="button">图表</button>
        <button type="button">文本</button>
        <button type="button">视频</button>
        <button type="button">Shader</button>
      </nav>
      <div class="empty-panel">模型库将在下一阶段接入</div>
    </aside>

    <section class="viewport-shell">
      <div class="viewport-tools">移动 · 旋转 · 缩放 · 聚焦</div>
      <EditorCanvas />
    </section>

    <aside class="inspector-panel" data-testid="inspector-panel">
      <nav class="inspector-tabs">
        <button type="button" class="active">场景内容</button>
        <button type="button">交互事件</button>
        <button type="button">Socket 任务</button>
        <button type="button">项目配置</button>
      </nav>
      <div class="empty-panel">当前场景暂无节点</div>
    </aside>

    <footer class="status-bar" data-testid="status-bar">
      <span>对象 0</span><span>顶点 0</span><span>面 0</span><span>FPS --</span>
      <span class="save-state">已保存</span>
    </footer>
  </main>
</template>
