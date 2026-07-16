<script setup lang="ts">
import type { Asset } from '@digital-twin/api-contracts';
import type { EditableNodePatch } from '@digital-twin/editor-core';
import type { SceneNode } from '@digital-twin/scene-schema';
import { computed, ref, watch } from 'vue';
import TransformInspector from './TransformInspector.vue';
import MaterialInspector from './MaterialInspector.vue';

const props = withDefaults(
  defineProps<{
    node: SceneNode;
    textureAssets?: Asset[];
    changeVersion?: number;
  }>(),
  { textureAssets: () => [], changeVersion: 0 },
);
const emit = defineEmits<{ update: [patch: EditableNodePatch] }>();

const nameDraft = ref('');
const businessDataDraft = ref('{}');
const businessDataError = ref('');
function componentOf<T extends SceneNode['components'][number]['kind']>(
  kind: T,
): Extract<SceneNode['components'][number], { kind: T }> | undefined {
  // SceneDocument 存在 shallowRef 中；显式读取代次让原地命令更新可以使 computed 失效。
  void props.changeVersion;
  const component = props.node.components.find(
    (
      component,
    ): component is Extract<SceneNode['components'][number], { kind: T }> =>
      component.kind === kind,
  );
  // 返回新身份，确保依赖浅响应式文档的子检查器能收到 prop 更新，而不是命中 Object.is 缓存。
  return component
    ? (JSON.parse(JSON.stringify(component)) as Extract<
        SceneNode['components'][number],
        { kind: T }
      >)
    : undefined;
}

const geometry = computed(() => componentOf('geometry'));
const light = computed(() => componentOf('light'));
const model = computed(() => componentOf('model'));
const material = computed(() => componentOf('material'));

watch(
  () => [props.node, props.changeVersion] as const,
  ([node]) => {
    nameDraft.value = node.name;
    businessDataDraft.value = JSON.stringify(node.businessData, null, 2);
    businessDataError.value = '';
  },
  { immediate: true, deep: true },
);

function cloneComponents(): SceneNode['components'] {
  // SceneNode 协议仅包含 JSON 数据，JSON 快照可避免直接克隆 Vue props Proxy。
  return JSON.parse(
    JSON.stringify(props.node.components),
  ) as SceneNode['components'];
}

function commitName(): void {
  const name = nameDraft.value.trim();
  if (!name || name === props.node.name) return;
  emit('update', { name });
}

function updateGeometry(event: Event): void {
  const primitive = (event.target as HTMLSelectElement).value as Extract<
    SceneNode['components'][number],
    { kind: 'geometry' }
  >['primitive'];
  const components = cloneComponents();
  const component = components.find((item) => item.kind === 'geometry');
  if (component?.kind === 'geometry') component.primitive = primitive;
  emit('update', { components });
}

function updateLight(patch: {
  color?: string;
  intensity?: number;
  castShadow?: boolean;
}): void {
  const components = cloneComponents();
  const component = components.find((item) => item.kind === 'light');
  if (component?.kind !== 'light') return;
  Object.assign(component, patch);
  emit('update', { components });
}

function updateMaterial(
  value: Extract<SceneNode['components'][number], { kind: 'material' }>,
): void {
  const components = cloneComponents();
  const index = components.findIndex((item) => item.kind === 'material');
  if (index >= 0) components[index] = value;
  else components.push(value);
  emit('update', { components });
}

function restoreMaterial(): void {
  emit('update', {
    components: cloneComponents().filter((item) => item.kind !== 'material'),
  });
}

function commitBusinessData(): void {
  try {
    const value = JSON.parse(businessDataDraft.value) as unknown;
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new Error('业务数据必须是 JSON 对象');
    }
    businessDataError.value = '';
    emit('update', { businessData: value as SceneNode['businessData'] });
  } catch (error) {
    businessDataError.value =
      error instanceof Error ? error.message : 'JSON 格式错误';
  }
}
</script>

<template>
  <section class="node-inspector" data-testid="node-inspector">
    <header class="inspector-title">
      <strong>{{ node.name }}</strong>
      <span>{{ node.id.slice(0, 8) }}</span>
    </header>

    <div class="inspector-field">
      <label for="node-name">名称</label>
      <input
        id="node-name"
        v-model="nameDraft"
        :disabled="node.locked"
        @change="commitName"
      />
    </div>
    <div class="inspector-checks">
      <label>
        <input
          type="checkbox"
          :checked="node.enabled"
          @change="
            emit('update', {
              enabled: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        可见
      </label>
      <label>
        <input
          type="checkbox"
          :checked="node.locked"
          @change="
            emit('update', {
              locked: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        锁定
      </label>
    </div>

    <TransformInspector
      :transform="node.transform"
      :disabled="node.locked"
      @commit="emit('update', { transform: $event.after })"
    />

    <section v-if="geometry?.kind === 'geometry'" class="component-inspector">
      <div class="inspector-section-title">几何体</div>
      <div class="inspector-field">
        <label for="geometry-primitive">类型</label>
        <select
          id="geometry-primitive"
          :value="geometry.primitive"
          :disabled="node.locked"
          @change="updateGeometry"
        >
          <option value="box">立方体</option>
          <option value="sphere">球体</option>
          <option value="plane">平面</option>
          <option value="cylinder">圆柱体</option>
        </select>
      </div>
    </section>

    <section v-if="light?.kind === 'light'" class="component-inspector">
      <div class="inspector-section-title">灯光</div>
      <div class="inspector-field">
        <label for="light-color">颜色</label>
        <input
          id="light-color"
          type="color"
          :value="light.color"
          :disabled="node.locked"
          @change="
            updateLight({ color: ($event.target as HTMLInputElement).value })
          "
        />
      </div>
      <div class="inspector-field">
        <label for="light-intensity">强度</label>
        <input
          id="light-intensity"
          type="number"
          min="0"
          step="0.1"
          :value="light.intensity"
          :disabled="node.locked"
          @change="
            updateLight({
              intensity: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </div>
      <label class="inspector-checkbox">
        <input
          type="checkbox"
          :checked="light.castShadow"
          :disabled="node.locked"
          @change="
            updateLight({
              castShadow: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        投射阴影
      </label>
    </section>

    <section v-if="model?.kind === 'model'" class="component-inspector">
      <div class="inspector-section-title">模型资源</div>
      <code class="asset-id">{{ model.assetId }}</code>
    </section>

    <MaterialInspector
      v-if="model?.kind === 'model' || geometry?.kind === 'geometry'"
      :component="material?.kind === 'material' ? material : undefined"
      :disabled="node.locked"
      :texture-assets="textureAssets"
      @update="updateMaterial"
      @restore="restoreMaterial"
    />

    <section class="component-inspector">
      <div class="inspector-section-title">业务数据 JSON</div>
      <textarea
        v-model="businessDataDraft"
        rows="6"
        :disabled="node.locked"
        aria-label="业务数据 JSON"
        @change="commitBusinessData"
      />
      <p v-if="businessDataError" class="field-error">
        {{ businessDataError }}
      </p>
    </section>
  </section>
</template>
