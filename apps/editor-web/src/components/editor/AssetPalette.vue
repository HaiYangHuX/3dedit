<script setup lang="ts">
type AssetCategory =
  'model' | 'geometry' | 'light' | 'chart' | 'text' | 'video' | 'shader';

const props = defineProps<{ active: AssetCategory }>();
const emit = defineEmits<{ 'update:active': [category: AssetCategory] }>();
const categories: Array<{
  id: AssetCategory;
  label: string;
  icon: string;
}> = [
  { id: 'model', label: '模型', icon: '◇' },
  { id: 'geometry', label: '几何', icon: '⬡' },
  { id: 'light', label: '灯光', icon: '✦' },
  { id: 'chart', label: '图表', icon: '▥' },
  { id: 'text', label: '文本', icon: 'T' },
  { id: 'video', label: '视频', icon: '▶' },
  { id: 'shader', label: '特效', icon: '∿' },
];
</script>

<template>
  <aside class="asset-panel" data-testid="asset-panel">
    <nav class="asset-categories" aria-label="场景元素分类">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="asset-category-item"
        :class="{ active: props.active === category.id }"
        :data-asset-category="category.id"
        :title="category.label"
        @click="emit('update:active', category.id)"
      >
        <span class="asset-category-icon">{{ category.icon }}</span>
        <span>{{ category.label }}</span>
      </button>
    </nav>
    <section class="asset-palette-content">
      <header>
        {{ categories.find((item) => item.id === props.active)?.label }}
      </header>
      <div class="asset-palette-scroll"><slot /></div>
    </section>
  </aside>
</template>
