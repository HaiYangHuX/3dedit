<script setup lang="ts">
import type { RenderStats, SceneStats } from '@digital-twin/three-engine';

defineProps<{ scene: SceneStats; render: RenderStats }>();
</script>

<template>
  <dl class="viewport-stats" data-testid="viewport-stats">
    <div>
      <dt>对象</dt>
      <dd>{{ scene.objectCount }}</dd>
    </div>
    <div>
      <dt>网格</dt>
      <dd>{{ scene.meshCount }}</dd>
    </div>
    <div>
      <dt>顶点</dt>
      <dd>{{ scene.vertexCount.toLocaleString() }}</dd>
    </div>
    <div>
      <dt>面</dt>
      <dd>{{ scene.faceCount.toLocaleString() }}</dd>
    </div>
    <div>
      <dt>FPS</dt>
      <dd>{{ render.fps || '--' }}</dd>
    </div>
    <div>
      <dt>Calls</dt>
      <dd>{{ render.drawCalls }}</dd>
    </div>
  </dl>
</template>
