<script setup lang="ts">
import type { RuntimeNavigationState } from '@digital-twin/three-engine';
import { ref } from 'vue';

defineProps<{ state: RuntimeNavigationState }>();
const emit = defineEmits<{
  reset: [];
  'toggle-first-person': [];
  play: [pathId: string];
}>();
const roamingMenuOpen = ref(false);

function play(pathId: string): void {
  roamingMenuOpen.value = false;
  emit('play', pathId);
}
</script>

<template>
  <div class="runtime-preview-toolbar-wrap">
    <nav
      class="runtime-preview-toolbar"
      data-testid="runtime-preview-toolbar"
      aria-label="预览相机工具"
      @keydown.esc="roamingMenuOpen = false"
    >
      <button
        type="button"
        aria-label="重置场景相机位置"
        title="重置场景相机位置(鼠标无法控制相机时)"
        @click="emit('reset')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 11.6 2.3L20 14M4 10l2.9-3.3A7 7 0 0 1 18.5 9"
          />
        </svg>
      </button>
      <button
        type="button"
        :class="{ active: state.mode === 'first-person' }"
        :aria-label="
          state.mode === 'first-person'
            ? '退出第一人称视角'
            : '进入第一人称视角'
        "
        :title="
          state.mode === 'first-person'
            ? '当前视角：第一人称'
            : '当前视角：第三人称'
        "
        @click="emit('toggle-first-person')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="7" r="3" />
          <path d="M5 21v-2a7 7 0 0 1 14 0v2M3 11l3 2 2-2M21 11l-3 2-2-2" />
        </svg>
      </button>
      <div class="runtime-roaming-menu">
        <button
          type="button"
          :disabled="state.paths.length === 0"
          :class="{ active: state.mode === 'roaming' }"
          aria-label="选择漫游路径"
          :aria-expanded="roamingMenuOpen"
          :title="
            state.paths.length > 0
              ? '选择相机漫游路径'
              : '请先选择场景相机添加漫游路径'
          "
          @click="roamingMenuOpen = !roamingMenuOpen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 19c3-6 4-8 7-8s4 2 7-6M5 19h.01M19 5h.01" />
            <circle cx="5" cy="19" r="2" />
            <circle cx="19" cy="5" r="2" />
          </svg>
        </button>
        <div v-if="roamingMenuOpen" class="runtime-roaming-dropdown">
          <button
            v-for="path in state.paths"
            :key="path.id"
            type="button"
            :class="{ active: state.activePathId === path.id }"
            :aria-label="`播放${path.name}`"
            @click="play(path.id)"
          >
            <span aria-hidden="true">⌖</span>
            {{ path.name }}
          </button>
        </div>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.runtime-preview-toolbar-wrap {
  position: absolute;
  top: 12px;
  left: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  width: 100%;
  pointer-events: none;
}

.runtime-preview-toolbar {
  display: flex;
  gap: 6px;
  padding: 4px 8px;
  background: rgb(11 15 25 / 85%);
  border: 1px solid rgb(56 189 248 / 25%);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 24%);
  backdrop-filter: blur(10px);
  pointer-events: auto;
}

.runtime-preview-toolbar button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  color: #7aa2f7;
  background: rgb(56 189 248 / 3%);
  border: 1px solid rgb(56 189 248 / 10%);
  border-radius: 4px;
  cursor: pointer;
}

.runtime-preview-toolbar button:hover,
.runtime-preview-toolbar button.active {
  color: #fff;
  background: rgb(56 189 248 / 18%);
  border-color: #38bdf8;
}

.runtime-preview-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.runtime-preview-toolbar svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.runtime-roaming-menu {
  position: relative;
}

.runtime-roaming-dropdown {
  position: absolute;
  top: calc(100% + 7px);
  left: 50%;
  display: grid;
  min-width: 160px;
  padding: 4px;
  background: rgb(11 15 25 / 96%);
  border: 1px solid rgb(56 189 248 / 25%);
  border-radius: 5px;
  box-shadow: 0 12px 30px rgb(0 0 0 / 35%);
  transform: translateX(-50%);
}

.runtime-preview-toolbar .runtime-roaming-dropdown button {
  display: flex;
  gap: 6px;
  justify-content: flex-start;
  width: 100%;
  padding: 0 8px;
  overflow: hidden;
  color: #cbd5e1;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-color: transparent;
}
</style>
