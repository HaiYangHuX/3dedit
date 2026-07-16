<script setup lang="ts">
import type { CameraView } from '@digital-twin/three-engine';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ quaternion?: [number, number, number, number] }>(),
  { quaternion: () => [0, 0, 0, 1] },
);
const emit = defineEmits<{ view: [view: CameraView] }>();

/** 把相机四元数的逆旋转转换成 CSS column-major matrix3d。 */
const cubeTransform = computed(() => {
  const [sourceX, sourceY, sourceZ, w] = props.quaternion;
  const x = -sourceX;
  const y = -sourceY;
  const z = -sourceZ;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  const values: number[] = [
    1 - 2 * (yy + zz),
    2 * (xy + wz),
    2 * (xz - wy),
    0,
    2 * (xy - wz),
    1 - 2 * (xx + zz),
    2 * (yz + wx),
    0,
    2 * (xz + wy),
    2 * (yz - wx),
    1 - 2 * (xx + yy),
    0,
    0,
    0,
    0,
    1,
  ];
  return `matrix3d(${values.map((value) => value.toFixed(6)).join(',')})`;
});

const faces: Array<{ view: CameraView; label: string }> = [
  { view: 'front', label: '前' },
  { view: 'back', label: '后' },
  { view: 'left', label: '左' },
  { view: 'right', label: '右' },
  { view: 'top', label: '上' },
  { view: 'bottom', label: '下' },
];
</script>

<template>
  <div
    class="viewport-gizmo"
    data-testid="viewport-gizmo"
    aria-label="视图方向"
  >
    <div class="viewport-gizmo-scene">
      <div class="viewport-gizmo-cube" :style="{ transform: cubeTransform }">
        <button
          v-for="face in faces"
          :key="face.view"
          type="button"
          class="viewport-gizmo-face"
          :class="`viewport-gizmo-face--${face.view}`"
          :data-view="face.view"
          :aria-label="`${face.label}视图`"
          @click.stop="emit('view', face.view)"
        >
          {{ face.label }}
        </button>
      </div>
    </div>
    <span class="gizmo-axis gizmo-axis--x">X</span>
    <span class="gizmo-axis gizmo-axis--y">Y</span>
    <span class="gizmo-axis gizmo-axis--z">Z</span>
  </div>
</template>
