<script setup lang="ts">
import type { Transform } from '@digital-twin/scene-schema';
import { reactive, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{ transform: Transform; disabled?: boolean }>(),
  { disabled: false },
);
const emit = defineEmits<{
  commit: [change: { before: Transform; after: Transform }];
}>();

type TransformGroup = 'position' | 'rotation' | 'scale';
const uniformScale = ref(false);
const draft = reactive({
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
});

function resetDraft(transform: Transform): void {
  draft.position = [...transform.position];
  draft.rotation = transform.rotation.map(
    (radian) => (radian * 180) / Math.PI,
  ) as [number, number, number];
  draft.scale = [...transform.scale];
}

watch(() => props.transform, resetDraft, { immediate: true, deep: true });

function inputValue(event: Event): number | undefined {
  const value = Number((event.target as HTMLInputElement).value);
  return Number.isFinite(value) ? value : undefined;
}

function updateDraft(group: TransformGroup, axis: number, event: Event): void {
  const value = inputValue(event);
  if (value === undefined) return;
  if (group === 'scale' && uniformScale.value) {
    draft.scale = [value, value, value];
    return;
  }
  draft[group][axis] = value;
}

function snapshotDraft(): Transform {
  return {
    position: [...draft.position],
    rotation: draft.rotation.map((degree) => (degree * Math.PI) / 180) as [
      number,
      number,
      number,
    ],
    scale: [...draft.scale],
  };
}

function commit(group: TransformGroup, axis: number, event: Event): void {
  updateDraft(group, axis, event);
  // Vue props 是只读 Proxy，以显式数组快照跨越组件/命令边界。
  const before: Transform = {
    position: [...props.transform.position],
    rotation: [...props.transform.rotation],
    scale: [...props.transform.scale],
  };
  const after = snapshotDraft();
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  // input 只维护草稿，在 change/blur 边界生成唯一可撤销命令。
  emit('commit', { before, after });
}
</script>

<template>
  <section class="transform-inspector">
    <div class="inspector-section-title">位置</div>
    <div class="axis-inputs">
      <label v-for="(axis, index) in ['X', 'Y', 'Z']" :key="`p-${axis}`">
        <span>{{ axis }}</span>
        <input
          type="number"
          step="0.1"
          :aria-label="`位置 ${axis}`"
          :value="draft.position[index]"
          :disabled="disabled"
          @input="updateDraft('position', index, $event)"
          @change="commit('position', index, $event)"
        />
      </label>
    </div>

    <div class="inspector-section-title">旋转（度）</div>
    <div class="axis-inputs">
      <label v-for="(axis, index) in ['X', 'Y', 'Z']" :key="`r-${axis}`">
        <span>{{ axis }}</span>
        <input
          type="number"
          step="1"
          :aria-label="`旋转 ${axis}`"
          :value="Number((draft.rotation[index] ?? 0).toFixed(3))"
          :disabled="disabled"
          @input="updateDraft('rotation', index, $event)"
          @change="commit('rotation', index, $event)"
        />
      </label>
    </div>

    <div class="inspector-section-title inspector-section-title--inline">
      <span>缩放</span>
      <label class="uniform-scale">
        <input v-model="uniformScale" type="checkbox" aria-label="统一缩放" />
        统一
      </label>
    </div>
    <div class="axis-inputs">
      <label v-for="(axis, index) in ['X', 'Y', 'Z']" :key="`s-${axis}`">
        <span>{{ axis }}</span>
        <input
          type="number"
          step="0.1"
          :aria-label="`缩放 ${axis}`"
          :value="draft.scale[index]"
          :disabled="disabled"
          @input="updateDraft('scale', index, $event)"
          @change="commit('scale', index, $event)"
        />
      </label>
    </div>
  </section>
</template>
