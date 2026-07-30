<script setup lang="ts">
import {
  Box,
  DataAnalysis,
  EditPen,
  Grid,
  MagicStick,
  Sunny,
  VideoCamera,
} from '@element-plus/icons-vue';
import { ElTooltip } from 'element-plus';
import type { Component } from 'vue';

type AssetCategory =
  'model' | 'geometry' | 'light' | 'chart' | 'text' | 'video' | 'shader';

const props = defineProps<{ active: AssetCategory }>();
const emit = defineEmits<{ 'update:active': [category: AssetCategory] }>();
const categories: Array<{
  id: AssetCategory;
  label: string;
  icon: Component;
}> = [
  { id: 'model', label: '模型', icon: Box },
  { id: 'geometry', label: '几何', icon: Grid },
  { id: 'light', label: '灯光', icon: Sunny },
  { id: 'chart', label: '图表', icon: DataAnalysis },
  { id: 'text', label: '文本', icon: EditPen },
  { id: 'video', label: '视频', icon: VideoCamera },
  { id: 'shader', label: '特效', icon: MagicStick },
];
</script>

<template>
  <aside class="asset-panel" data-testid="asset-panel">
    <nav class="asset-categories" aria-label="场景元素分类">
      <ElTooltip
        v-for="category in categories"
        :key="category.id"
        :content="category.label"
        placement="right"
        :show-after="400"
      >
        <button
          type="button"
          class="asset-category-item"
          :class="{ active: props.active === category.id }"
          :data-asset-category="category.id"
          @click="emit('update:active', category.id)"
        >
          <component
            :is="category.icon"
            class="asset-category-icon"
            aria-hidden="true"
          />
          <span>{{ category.label }}</span>
        </button>
      </ElTooltip>
    </nav>
    <section class="asset-palette-content">
      <header>
        {{ categories.find((item) => item.id === props.active)?.label }}
      </header>
      <div class="asset-palette-scroll"><slot /></div>
    </section>
  </aside>
</template>
