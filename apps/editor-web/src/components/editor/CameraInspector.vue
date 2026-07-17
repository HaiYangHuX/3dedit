<script setup lang="ts">
import type {
  CameraRoamingPath,
  SceneCamera,
} from '@digital-twin/scene-schema';
import type { EditableCameraPatch } from '@digital-twin/editor-core';
import type { CameraRoamingState } from '@digital-twin/three-engine';
import { ElTabPane, ElTabs } from 'element-plus';
import { reactive, ref, toRaw, watch } from 'vue';
import CameraRoamingPanel from './CameraRoamingPanel.vue';

const props = defineProps<{
  camera: SceneCamera;
  paths: readonly CameraRoamingPath[];
  roamingState: CameraRoamingState;
  changeVersion?: number;
}>();

const emit = defineEmits<{
  update: [patch: EditableCameraPatch];
  'start-drawing': [];
  'cancel-drawing': [];
  preview: [pathId: string];
  stop: [];
  remove: [pathId: string];
}>();

const activeTab = ref<'properties' | 'roaming'>('properties');
const cloneCamera = (camera: SceneCamera): SceneCamera =>
  structuredClone(toRaw(camera));
const draft = reactive<SceneCamera>(cloneCamera(props.camera));
type VectorField = 'position' | 'rotation' | 'scale';

watch(
  () => [props.camera, props.changeVersion] as const,
  // Vue props 是浅只读 Proxy，先取 raw 才能跨 structuredClone 边界。
  ([camera]) => Object.assign(draft, cloneCamera(camera)),
  { immediate: true },
);

function numericValue(event: Event): number | undefined {
  const value = Number((event.target as HTMLInputElement).value);
  return Number.isFinite(value) ? value : undefined;
}

function updateVector(
  field: VectorField,
  axis: number,
  event: Event,
  degrees = false,
): void {
  const value = numericValue(event);
  if (value === undefined) return;
  const vector = [...draft[field]] as [number, number, number];
  vector[axis] = degrees ? (value * Math.PI) / 180 : value;
  draft[field] = vector;
  emit('update', { [field]: vector });
}

function updateNumber(field: 'fov' | 'near' | 'far', event: Event): void {
  const value = numericValue(event);
  if (value !== undefined) {
    draft[field] = value;
    emit('update', { [field]: value });
  }
}

function updateName(event: Event): void {
  const name = (event.target as HTMLInputElement).value.trim();
  if (name && name !== draft.name) {
    draft.name = name;
    emit('update', { name });
  }
}
</script>

<template>
  <section
    class="camera-inspector"
    data-testid="camera-inspector"
    :data-change-version="changeVersion"
  >
    <ElTabs v-model="activeTab" class="camera-inspector-tabs">
      <ElTabPane label="属性" name="properties">
        <header class="inspector-title">
          <strong>{{ draft.name }}</strong>
          <span>PerspectiveCamera</span>
        </header>

        <div class="inspector-field">
          <label for="camera-name">名称</label>
          <input
            id="camera-name"
            :value="draft.name"
            aria-label="相机名称"
            @change="updateName"
          />
        </div>

        <div
          v-for="group in [
            { field: 'position', label: '位置', degrees: false },
            { field: 'rotation', label: '旋转（度）', degrees: true },
            { field: 'scale', label: '缩放', degrees: false },
          ] as const"
          :key="group.field"
          class="camera-vector-group"
        >
          <div class="inspector-section-title">{{ group.label }}</div>
          <div class="axis-inputs">
            <label
              v-for="(axis, index) in ['X', 'Y', 'Z']"
              :key="`${group.field}-${axis}`"
            >
              <span>{{ axis }}</span>
              <input
                type="number"
                :step="group.degrees ? 0.1 : 0.001"
                :aria-label="`相机${group.field === 'position' ? '位置' : group.field === 'rotation' ? '旋转' : '缩放'} ${axis}${group.degrees ? '（度）' : ''}`"
                :value="
                  group.degrees
                    ? Number(
                        ((draft[group.field][index]! * 180) / Math.PI).toFixed(
                          3,
                        ),
                      )
                    : draft[group.field][index]!
                "
                @change="
                  updateVector(group.field, index, $event, group.degrees)
                "
              />
            </label>
          </div>
        </div>

        <div class="inspector-checks camera-checks">
          <label
            v-for="item in [
              ['visible', '可见'],
              ['castShadow', '投射阴影'],
              ['receiveShadow', '接收阴影'],
              ['frustumCulled', '视锥体裁剪'],
            ] as const"
            :key="item[0]"
          >
            <input
              type="checkbox"
              :checked="draft[item[0]]"
              @change="
                emit('update', {
                  [item[0]]: ($event.target as HTMLInputElement).checked,
                })
              "
            />
            {{ item[1] }}
          </label>
        </div>

        <section class="component-inspector camera-projection-fields">
          <div class="inspector-section-title">透视相机</div>
          <div
            v-for="field in [
              { key: 'fov', label: '视野角', step: 0.01 },
              { key: 'near', label: '近裁剪面', step: 0.01 },
              { key: 'far', label: '远裁剪面', step: 100 },
            ] as const"
            :key="field.key"
            class="inspector-field"
          >
            <label :for="`camera-${field.key}`">{{ field.label }}</label>
            <input
              :id="`camera-${field.key}`"
              type="number"
              :step="field.step"
              :aria-label="`相机${field.label}`"
              :value="draft[field.key]"
              @change="updateNumber(field.key, $event)"
            />
          </div>
        </section>
      </ElTabPane>

      <ElTabPane label="相机漫游" name="roaming">
        <CameraRoamingPanel
          :paths="paths"
          :state="roamingState"
          @start-drawing="emit('start-drawing')"
          @cancel-drawing="emit('cancel-drawing')"
          @preview="emit('preview', $event)"
          @stop="emit('stop')"
          @remove="emit('remove', $event)"
        />
      </ElTabPane>
    </ElTabs>
  </section>
</template>
