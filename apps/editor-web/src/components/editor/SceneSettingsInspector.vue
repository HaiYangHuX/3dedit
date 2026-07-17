<script setup lang="ts">
import type { Asset } from '@digital-twin/api-contracts';
import type { EditableSceneSettingsPatch } from '@digital-twin/editor-core';
import type { SceneDocument, SceneSettings } from '@digital-twin/scene-schema';
import {
  ElColorPicker,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSlider,
} from 'element-plus';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    settings: SceneDocument['settings'];
    assets?: Asset[];
    builtinEnvironmentPreviewUrl?: string;
    uploading?: boolean;
    // 命令历史原地修改稳定文档对象，使用代次让所有受控组件重新读取最新字段。
    changeVersion?: number;
  }>(),
  {
    assets: () => [],
    builtinEnvironmentPreviewUrl: '',
    uploading: false,
    changeVersion: 0,
  },
);
const emit = defineEmits<{
  update: [patch: EditableSceneSettingsPatch];
  'upload-background': [file: File];
  'upload-environment': [file: File];
}>();

const backgroundFile = ref<HTMLInputElement>();
const environmentFile = ref<HTMLInputElement>();

const toneMappingOptions: Array<{
  value: SceneSettings['toneMapping'];
  label: string;
}> = [
  { value: 'custom', label: '自定义色调映射(CustomToneMapping)' },
  { value: 'none', label: '无色调映射(NoToneMapping)' },
  { value: 'linear', label: '线性色调映射(LinearToneMapping)' },
  { value: 'reinhard', label: 'Reinhard色调映射(ReinhardToneMapping)' },
  { value: 'cineon', label: 'Cineon色调映射(CineonToneMapping)' },
  { value: 'aces-filmic', label: 'ACES色调映射(ACESFilmicToneMapping)' },
  { value: 'agx', label: 'AgX色调映射(AgXToneMapping)' },
  { value: 'neutral', label: 'Neutral色调映射(NeutralToneMapping)' },
];

const shadowOptions: Array<{
  value: SceneSettings['shadowMapType'];
  label: string;
}> = [
  { value: 'basic', label: '无阴影(NoShadow)' },
  { value: 'pcf', label: 'PCF阴影(PCFShadowMap)' },
  { value: 'pcf-soft', label: 'PCF软阴影(PCFSoftShadowMap)' },
  { value: 'vsm', label: 'VSM阴影(VSMShadowMap)' },
];

const backgroundOptions: Array<{
  value: SceneSettings['backgroundType'];
  label: string;
}> = [
  { value: 'none', label: '无背景' },
  { value: 'color', label: '颜色(Color)' },
  { value: 'texture', label: '图片(Texture)' },
];

const fogOptions: Array<{
  value: SceneSettings['fogType'];
  label: string;
}> = [
  { value: 'none', label: '无' },
  { value: 'linear', label: '雾(Fog)' },
  { value: 'exponential', label: '雾(FogExp2)' },
];

const groundOptions: Array<{
  value: SceneSettings['groundType'];
  label: string;
}> = [
  { value: 'none', label: '无' },
  { value: 'grid', label: '网格' },
  { value: 'lawn', label: '草坪' },
  { value: 'rock', label: '岩石' },
  { value: 'stone', label: '砂石' },
  { value: 'floor', label: '地板' },
  { value: 'tile-1', label: '地砖（1）' },
  { value: 'tile-2', label: '地砖（2）' },
  { value: 'brick', label: '板砖' },
];

const weatherOptions: Array<{
  value: SceneSettings['weatherType'];
  label: string;
}> = [
  { value: 'none', label: '无' },
  { value: 'rain', label: '雨' },
  { value: 'snow', label: '雪' },
];

const backgroundAsset = computed(() =>
  props.assets.find(({ id }) => id === props.settings.backgroundAssetId),
);
const environmentAsset = computed(() =>
  props.assets.find(({ id }) => id === props.settings.environmentAssetId),
);
const environmentPreview = computed(() =>
  props.settings.environmentAssetId
    ? environmentAsset.value?.thumbnailUrl
    : props.builtinEnvironmentPreviewUrl,
);

function commit<K extends keyof SceneSettings>(
  key: K,
  value: SceneSettings[K],
): void {
  if (value === props.settings[key]) return;
  emit('update', { [key]: value } as EditableSceneSettingsPatch);
}

function commitNumber<K extends keyof SceneSettings>(
  key: K,
  value: number | undefined,
): void {
  if (typeof value === 'number' && Number.isFinite(value))
    commit(key, value as SceneSettings[K]);
}

function commitSlider<K extends keyof SceneSettings>(
  key: K,
  value: number | number[],
): void {
  if (!Array.isArray(value)) commitNumber(key, value);
}

function commitColor(
  key: 'background' | 'fogColor',
  value: string | null,
): void {
  if (value) commit(key, value);
}

function selectFile(event: Event, kind: 'background' | 'environment'): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file && kind === 'background') emit('upload-background', file);
  if (file && kind === 'environment') emit('upload-environment', file);
  // 清空 value 后才能连续选择同名文件重试上传。
  input.value = '';
}

function commitGround(value: SceneSettings['groundType']): void {
  emit('update', {
    groundType: value,
    gridVisible: value === 'grid',
  });
}
</script>

<template>
  <section
    class="scene-settings-inspector"
    data-testid="scene-settings"
    :data-change-version="changeVersion"
  >
    <header class="inspector-title"><strong>项目配置</strong></header>

    <h3 class="project-settings-title">渲染器</h3>
    <div class="project-settings-row">
      <label>色调映射</label>
      <ElSelect
        data-testid="tone-mapping"
        :model-value="settings.toneMapping"
        placeholder="请选择"
        @change="commit('toneMapping', $event)"
      >
        <ElOption
          v-for="option in toneMappingOptions"
          :key="option.value"
          data-tone-option
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
    </div>
    <div class="project-settings-row">
      <label>阴影</label>
      <ElSelect
        data-testid="shadow-map"
        :model-value="settings.shadowMapType"
        placeholder="请选择"
        @change="commit('shadowMapType', $event)"
      >
        <ElOption
          v-for="option in shadowOptions"
          :key="option.value"
          data-shadow-option
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
    </div>
    <div class="project-settings-row project-settings-row--slider">
      <label>曝光度</label>
      <ElSlider
        data-testid="exposure"
        aria-valuemin="0"
        aria-valuemax="5"
        :model-value="settings.exposure"
        :min="0"
        :max="5"
        :step="0.1"
        show-input
        @change="commitSlider('exposure', $event)"
      />
    </div>

    <h3 class="project-settings-title">场景</h3>
    <div class="project-settings-row">
      <label>背景</label>
      <div class="project-settings-inline">
        <ElSelect
          data-testid="background-type"
          :model-value="settings.backgroundType"
          placeholder="请选择"
          @change="commit('backgroundType', $event)"
        >
          <ElOption
            v-for="option in backgroundOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </ElSelect>
        <ElColorPicker
          v-if="settings.backgroundType === 'color'"
          data-testid="background-color"
          :model-value="settings.background"
          @change="commitColor('background', $event)"
        />
      </div>
    </div>
    <div
      v-if="settings.backgroundType === 'texture'"
      class="project-settings-conditional"
      data-testid="background-texture-fields"
    >
      <div class="project-settings-row">
        <label>背景图</label>
        <button
          class="project-asset-picker"
          type="button"
          :disabled="uploading"
          title="支持 .jpg、.png、.hdr"
          @click="backgroundFile?.click()"
        >
          <img
            v-if="backgroundAsset?.thumbnailUrl"
            :src="backgroundAsset.thumbnailUrl"
            :alt="backgroundAsset.name"
          />
          <span v-else>{{
            uploading ? '上传中…' : backgroundAsset?.name || '+'
          }}</span>
        </button>
        <input
          ref="backgroundFile"
          data-testid="background-file"
          class="project-file-input"
          type="file"
          accept=".jpg,.png,.hdr"
          @change="selectFile($event, 'background')"
        />
      </div>
      <div class="project-settings-row project-settings-row--slider">
        <label>模糊度</label>
        <ElSlider
          data-testid="background-blurriness"
          :model-value="settings.backgroundBlurriness"
          :min="0"
          :max="1"
          :step="0.1"
          show-input
          @change="commitSlider('backgroundBlurriness', $event)"
        />
      </div>
      <div class="project-settings-row project-settings-row--slider">
        <label>强度</label>
        <ElSlider
          data-testid="background-intensity"
          :model-value="settings.backgroundIntensity"
          :min="0"
          :max="6"
          :step="0.1"
          show-input
          @change="commitSlider('backgroundIntensity', $event)"
        />
      </div>
    </div>

    <div class="project-settings-row">
      <label>环境</label>
      <div class="project-settings-inline">
        <ElSelect
          data-testid="environment-type"
          :model-value="settings.environmentEnabled"
          placeholder="请选择"
          @change="commit('environmentEnabled', $event)"
        >
          <ElOption label="无" :value="false" />
          <ElOption label="Environment" :value="true" />
        </ElSelect>
        <template v-if="settings.environmentEnabled">
          <button
            class="project-asset-picker"
            type="button"
            :disabled="uploading"
            title="支持 .jpg、.png、.hdr"
            @click="environmentFile?.click()"
          >
            <img
              v-if="environmentPreview"
              data-testid="environment-preview"
              :src="environmentPreview"
              :alt="environmentAsset?.name || '内置 Venice HDR'"
            />
            <span v-else>{{
              uploading ? '上传中…' : environmentAsset?.name || 'HDR'
            }}</span>
          </button>
          <input
            ref="environmentFile"
            data-testid="environment-file"
            class="project-file-input"
            type="file"
            accept=".jpg,.png,.hdr"
            @change="selectFile($event, 'environment')"
          />
        </template>
      </div>
    </div>
    <p
      v-if="settings.environmentEnabled && !settings.environmentAssetId"
      class="project-settings-hint"
      data-testid="environment-hint"
    >
      当前使用内置 Venice HDR（Y 轴旋转 90°）
    </p>

    <div class="project-settings-row">
      <label>雾</label>
      <div class="project-settings-inline">
        <ElSelect
          data-testid="fog-type"
          :model-value="settings.fogType"
          placeholder="请选择"
          @change="commit('fogType', $event)"
        >
          <ElOption
            v-for="option in fogOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </ElSelect>
        <ElColorPicker
          v-if="settings.fogType !== 'none'"
          data-testid="fog-color"
          :model-value="settings.fogColor"
          @change="commitColor('fogColor', $event)"
        />
      </div>
    </div>
    <div
      v-if="settings.fogType === 'linear'"
      class="project-settings-row"
      data-testid="fog-linear-fields"
    >
      <label>雾浓度</label>
      <div class="project-number-pair">
        <ElInputNumber
          data-testid="fog-near"
          :model-value="settings.fogNear"
          :min="0"
          :max="1000"
          :step="2"
          :precision="2"
          controls-position="right"
          @change="commitNumber('fogNear', $event)"
        />
        <ElInputNumber
          data-testid="fog-far"
          :model-value="settings.fogFar"
          :min="0"
          :max="1000"
          :step="2"
          :precision="2"
          controls-position="right"
          @change="commitNumber('fogFar', $event)"
        />
      </div>
    </div>
    <div
      v-else-if="settings.fogType === 'exponential'"
      class="project-settings-row"
      data-testid="fog-density"
    >
      <label>雾浓度</label>
      <ElInputNumber
        :model-value="settings.fogDensity"
        :min="0"
        :max="5"
        :step="0.01"
        :precision="3"
        controls-position="right"
        @change="commitNumber('fogDensity', $event)"
      />
    </div>

    <h3 class="project-settings-title">地面</h3>
    <div class="project-settings-row">
      <label>类型</label>
      <ElSelect
        data-testid="ground-type"
        :model-value="settings.groundType"
        placeholder="请选择"
        @change="commitGround($event)"
      >
        <ElOption
          v-for="option in groundOptions"
          :key="option.value"
          data-ground-option
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
    </div>

    <h3 class="project-settings-title">天气</h3>
    <div class="project-settings-row">
      <label>天气</label>
      <ElSelect
        data-testid="weather-type"
        :model-value="settings.weatherType"
        placeholder="请选择"
        @change="commit('weatherType', $event)"
      >
        <ElOption
          v-for="option in weatherOptions"
          :key="option.value"
          data-weather-option
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
    </div>
    <div
      v-if="settings.weatherType !== 'none'"
      class="project-settings-conditional"
      data-testid="weather-fields"
    >
      <div class="project-settings-row project-settings-row--slider">
        <label>数量</label>
        <ElSlider
          data-testid="weather-count"
          aria-valuemin="0"
          aria-valuemax="100000"
          :model-value="settings.weatherCount"
          :min="0"
          :max="100000"
          :step="10"
          show-input
          @change="commitSlider('weatherCount', $event)"
        />
      </div>
      <div class="project-settings-row project-settings-row--slider">
        <label>速度</label>
        <ElSlider
          :model-value="settings.weatherSpeed"
          :min="0.1"
          :max="1.5"
          :step="0.1"
          show-input
          @change="commitSlider('weatherSpeed', $event)"
        />
      </div>
      <div class="project-settings-row project-settings-row--slider">
        <label>透明度</label>
        <ElSlider
          :model-value="settings.weatherOpacity"
          :min="0"
          :max="1"
          :step="0.1"
          show-input
          @change="commitSlider('weatherOpacity', $event)"
        />
      </div>
      <div class="project-settings-row project-settings-row--slider">
        <label>大小</label>
        <ElSlider
          :model-value="settings.weatherSize"
          :min="0.1"
          :max="2"
          :step="0.1"
          show-input
          @change="commitSlider('weatherSize', $event)"
        />
      </div>
      <div class="project-settings-row project-settings-row--slider">
        <label>范围</label>
        <ElSlider
          :model-value="settings.weatherArea"
          :min="0"
          :max="500"
          :step="10"
          show-input
          @change="commitSlider('weatherArea', $event)"
        />
      </div>
      <div class="project-settings-row project-settings-row--slider">
        <label>高度</label>
        <ElSlider
          :model-value="settings.weatherHeight"
          :min="0"
          :max="300"
          :step="5"
          show-input
          @change="commitSlider('weatherHeight', $event)"
        />
      </div>
    </div>
  </section>
</template>
