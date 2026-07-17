<script setup lang="ts">
import type { CameraRoamingPath } from '@digital-twin/scene-schema';
import type { CameraRoamingState } from '@digital-twin/three-engine';
import { Delete, Plus, VideoPause, VideoPlay } from '@element-plus/icons-vue';
import { ElTooltip } from 'element-plus';

defineProps<{
  paths: readonly CameraRoamingPath[];
  state: CameraRoamingState;
}>();

const emit = defineEmits<{
  'start-drawing': [];
  'cancel-drawing': [];
  preview: [pathId: string];
  stop: [];
  remove: [pathId: string];
}>();
</script>

<template>
  <section class="camera-roaming-panel">
    <div v-if="state.mode === 'drawing'" class="camera-roaming-hint">
      <strong>正在绘制漫游路径</strong>
      <span>Ctrl / ⌘ + 左键定点 → 松开 Ctrl / ⌘ 结束</span>
      <span>当前 {{ state.pointCount }} 个点</span>
      <button type="button" @click="emit('cancel-drawing')">取消绘制</button>
    </div>

    <div v-if="paths.length > 0" class="camera-roaming-list">
      <article v-for="path in paths" :key="path.id" class="camera-roaming-item">
        <div>
          <strong>{{ path.name }}</strong>
          <span>{{ path.pathPoints.length }} 个点</span>
        </div>
        <span class="camera-roaming-actions">
          <ElTooltip
            :content="state.activePathId === path.id ? '停止漫游' : '播放漫游'"
            placement="top"
          >
            <button
              v-if="state.activePathId === path.id"
              type="button"
              :aria-label="`停止${path.name}`"
              @click="emit('stop')"
            >
              <VideoPause aria-hidden="true" />
            </button>
            <button
              v-else
              type="button"
              :aria-label="`播放${path.name}`"
              @click="emit('preview', path.id)"
            >
              <VideoPlay aria-hidden="true" />
            </button>
          </ElTooltip>
          <ElTooltip content="删除漫游路径" placement="top">
            <button
              type="button"
              :aria-label="`删除${path.name}`"
              @click="emit('remove', path.id)"
            >
              <Delete aria-hidden="true" />
            </button>
          </ElTooltip>
        </span>
      </article>
    </div>
    <div v-else class="camera-roaming-empty">暂无相机漫游路径</div>

    <button
      type="button"
      class="camera-roaming-add"
      aria-label="添加漫游路径"
      :disabled="state.mode !== 'idle'"
      @click="emit('start-drawing')"
    >
      <Plus aria-hidden="true" />
      添加漫游路径
    </button>
  </section>
</template>
