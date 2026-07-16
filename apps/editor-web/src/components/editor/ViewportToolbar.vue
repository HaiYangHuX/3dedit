<script setup lang="ts">
const props = defineProps<{
  mode: 'translate' | 'rotate' | 'scale';
  space: 'local' | 'world';
  gridVisible: boolean;
  isFullscreen: boolean;
}>();
const emit = defineEmits<{
  mode: [mode: 'translate' | 'rotate' | 'scale'];
  space: [space: 'local' | 'world'];
  grid: [visible: boolean];
  focus: [];
  reset: [];
  screenshot: [];
  fullscreen: [];
}>();
</script>

<template>
  <div class="viewport-tools" role="toolbar" aria-label="视口工具">
    <button
      type="button"
      data-tool="translate"
      title="移动 (W)"
      aria-label="移动 W"
      :class="{ active: props.mode === 'translate' }"
      @click="emit('mode', 'translate')"
    >
      <b>↔</b><span class="viewport-tool-label">移动</span><kbd>W</kbd>
    </button>
    <button
      type="button"
      data-tool="rotate"
      title="旋转 (E)"
      aria-label="旋转 E"
      :class="{ active: props.mode === 'rotate' }"
      @click="emit('mode', 'rotate')"
    >
      <b>↻</b><span class="viewport-tool-label">旋转</span><kbd>E</kbd>
    </button>
    <button
      type="button"
      data-tool="scale"
      title="缩放 (R)"
      aria-label="缩放 R"
      :class="{ active: props.mode === 'scale' }"
      @click="emit('mode', 'scale')"
    >
      <b>⌗</b><span class="viewport-tool-label">缩放</span><kbd>R</kbd>
    </button>
    <span class="viewport-tool-divider" />
    <button
      type="button"
      data-tool="space"
      :title="`坐标空间：${props.space === 'world' ? '世界' : '局部'}`"
      :aria-label="`切换坐标空间，当前${props.space === 'world' ? '世界' : '局部'}`"
      @click="emit('space', props.space === 'world' ? 'local' : 'world')"
    >
      <b>◎</b><span>{{ props.space === 'world' ? '世界' : '局部' }}</span>
    </button>
    <button
      type="button"
      data-tool="grid"
      :class="{ active: props.gridVisible }"
      :title="props.gridVisible ? '隐藏网格' : '显示网格'"
      :aria-label="props.gridVisible ? '隐藏网格' : '显示网格'"
      @click="emit('grid', !props.gridVisible)"
    >
      <b>▦</b><span>网格</span>
    </button>
    <span class="viewport-tool-divider" />
    <button
      type="button"
      data-tool="focus"
      title="聚焦选中 (F)"
      aria-label="聚焦选中 F"
      @click="emit('focus')"
    >
      <b>⌾</b><span>聚焦</span><kbd>F</kbd>
    </button>
    <button
      type="button"
      data-tool="reset-camera"
      title="重置相机"
      aria-label="重置相机"
      @click="emit('reset')"
    >
      <b>⌂</b><span>重置</span>
    </button>
    <button
      type="button"
      data-tool="screenshot"
      title="下载视口截图"
      aria-label="下载视口截图"
      @click="emit('screenshot')"
    >
      <b>▣</b><span>截图</span>
    </button>
    <button
      type="button"
      data-tool="fullscreen"
      :title="props.isFullscreen ? '退出全屏' : '视口全屏'"
      :aria-label="props.isFullscreen ? '退出视口全屏' : '视口全屏'"
      @click="emit('fullscreen')"
    >
      <b>{{ props.isFullscreen ? '⊡' : '⛶' }}</b
      ><span>全屏</span>
    </button>
  </div>
</template>
