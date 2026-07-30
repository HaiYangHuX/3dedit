<script setup lang="ts">
import type { Asset } from '@digital-twin/api-contracts';
import type { EditableNodePatch } from '@digital-twin/editor-core';
import {
  chartOptionSchema,
  type ChartComponent,
  type SceneNode,
  type TextComponent,
  type TextType,
} from '@digital-twin/scene-schema';
import {
  ElButton,
  ElColorPicker,
  ElInput,
  ElInputNumber,
  ElRadioButton,
  ElRadioGroup,
} from 'element-plus';
import { computed, ref, watch } from 'vue';
import TransformInspector from './TransformInspector.vue';
import MaterialInspector from './MaterialInspector.vue';
import { getShaderDefinition } from '../../editor/shaderPalette';
import { getChartDefinition } from '../../editor/chartPalette';
import { getTextDefinition } from '../../editor/textPalette';

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
const textContentDraft = ref('');
const chartOptionDraft = ref('{}');
const chartOptionError = ref('');
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
const shader = computed(() => componentOf('shader'));
const chart = computed(() => componentOf('chart'));
const text = computed(() => componentOf('text'));
const material = computed(() => componentOf('material'));

watch(
  () => [props.node, props.changeVersion] as const,
  ([node]) => {
    nameDraft.value = node.name;
    businessDataDraft.value = JSON.stringify(node.businessData, null, 2);
    businessDataError.value = '';
    const textComponent = node.components.find(
      (component) => component.kind === 'text',
    );
    textContentDraft.value =
      textComponent?.kind === 'text' ? textComponent.textContent : '';
    const chartComponent = node.components.find(
      (component) => component.kind === 'chart',
    );
    chartOptionDraft.value =
      chartComponent?.kind === 'chart'
        ? JSON.stringify(chartComponent.option, null, 2)
        : '{}';
    chartOptionError.value = '';
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

function updateText(patch: Partial<Omit<TextComponent, 'kind'>>): void {
  const components = cloneComponents();
  const component = components.find((item) => item.kind === 'text');
  if (component?.kind !== 'text') return;
  // 连续属性命令可能早于父级文档刷新，始终带上当前草稿可避免旧节点快照覆盖刚输入的文本。
  Object.assign(component, { textContent: textContentDraft.value }, patch);
  emit('update', { components });
}

function updateTextType(value: string | number | boolean | undefined): void {
  if (value === 'Sprite' || value === 'Mesh') {
    updateText({ textType: value as TextType });
  }
}

function updateChart(patch: Partial<Omit<ChartComponent, 'kind'>>): void {
  const components = cloneComponents();
  const component = components.find((item) => item.kind === 'chart');
  if (component?.kind !== 'chart') return;
  Object.assign(component, patch);
  emit('update', { components });
}

function commitChartOption(): void {
  try {
    const parsed = chartOptionSchema.safeParse(
      JSON.parse(chartOptionDraft.value),
    );
    if (!parsed.success) throw new Error('图表配置必须是 JSON 对象');
    chartOptionError.value = '';
    updateChart({ option: parsed.data });
  } catch (error) {
    chartOptionError.value =
      error instanceof SyntaxError
        ? '图表配置不是有效的 JSON'
        : error instanceof Error
          ? error.message
          : '图表配置格式错误';
  }
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

    <section v-if="shader?.kind === 'shader'" class="component-inspector">
      <div class="inspector-section-title">着色器</div>
      <div class="inspector-field">
        <label>类型</label>
        <span class="shader-method-name">
          {{ getShaderDefinition(shader.shaderMethod).name }}
        </span>
      </div>
    </section>

    <section v-if="text?.kind === 'text'" class="component-inspector">
      <div class="inspector-section-title">文本</div>
      <div class="inspector-field">
        <label>模板</label>
        <span class="shader-method-name">
          {{ getTextDefinition(text.textMethod).name }}
        </span>
      </div>
      <div class="inspector-field">
        <label>显示类型</label>
        <ElRadioGroup
          :model-value="text.textType"
          :disabled="node.locked"
          size="small"
          @change="updateTextType"
        >
          <ElRadioButton value="Sprite" data-testid="text-type-sprite">
            面向屏幕
          </ElRadioButton>
          <ElRadioButton value="Mesh" data-testid="text-type-mesh">
            面向场景
          </ElRadioButton>
        </ElRadioGroup>
      </div>
      <div class="inspector-field">
        <label>颜色</label>
        <ElColorPicker
          :model-value="text.color"
          :disabled="node.locked"
          show-alpha
          @change="(value) => value && updateText({ color: value })"
        />
      </div>
      <div class="inspector-field">
        <label>字号</label>
        <ElInputNumber
          data-testid="text-font-size"
          :model-value="text.fontSize"
          :min="8"
          :max="24"
          :step="1"
          :disabled="node.locked"
          controls-position="right"
          @change="
            (value) => value !== undefined && updateText({ fontSize: value })
          "
        />
      </div>
      <div class="inspector-field inspector-field--stacked">
        <label>文本内容</label>
        <ElInput
          v-model="textContentDraft"
          data-testid="text-content"
          type="textarea"
          :rows="3"
          maxlength="100"
          show-word-limit
          resize="vertical"
          :disabled="node.locked"
          @change="updateText({ textContent: textContentDraft })"
        />
      </div>
    </section>

    <section v-if="chart?.kind === 'chart'" class="component-inspector">
      <div class="inspector-section-title">图表</div>
      <div class="inspector-field">
        <label>模板</label>
        <span class="shader-method-name">
          {{ getChartDefinition(chart.chartType).name }}
        </span>
      </div>
      <div class="inspector-field">
        <label>画布尺寸</label>
        <div class="axis-inputs chart-size-inputs">
          <label>
            <span>宽</span>
            <ElInputNumber
              :model-value="chart.width"
              :min="160"
              :max="4096"
              :step="10"
              :disabled="node.locked"
              :controls="false"
              @change="
                (value) => value !== undefined && updateChart({ width: value })
              "
            />
          </label>
          <label>
            <span>高</span>
            <ElInputNumber
              :model-value="chart.height"
              :min="120"
              :max="4096"
              :step="10"
              :disabled="node.locked"
              :controls="false"
              @change="
                (value) => value !== undefined && updateChart({ height: value })
              "
            />
          </label>
        </div>
      </div>
      <div class="inspector-field inspector-field--stacked">
        <label>图表配置 JSON</label>
        <ElInput
          v-model="chartOptionDraft"
          class="chart-option-editor"
          data-testid="chart-option"
          type="textarea"
          :rows="10"
          resize="vertical"
          spellcheck="false"
          :disabled="node.locked"
        />
      </div>
      <p
        v-if="chartOptionError"
        class="field-error"
        data-testid="chart-option-error"
      >
        {{ chartOptionError }}
      </p>
      <div class="chart-option-actions">
        <ElButton
          type="primary"
          size="small"
          data-testid="update-chart-option"
          :disabled="node.locked"
          @click="commitChartOption"
        >
          更新图表数据
        </ElButton>
      </div>
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
