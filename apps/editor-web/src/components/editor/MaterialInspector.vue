<script setup lang="ts">
import type { Asset } from '@digital-twin/api-contracts';
import {
  createDefaultMaterialComponent,
  type MaterialComponent,
  type MaterialTextureSlot,
} from '@digital-twin/scene-schema';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    component?: MaterialComponent;
    disabled?: boolean;
    textureAssets?: Asset[];
  }>(),
  {
    component: undefined,
    disabled: false,
    textureAssets: () => [],
  },
);
const emit = defineEmits<{
  update: [component: MaterialComponent];
  restore: [];
}>();

type NumericMaterialField =
  | 'opacity'
  | 'roughness'
  | 'metalness'
  | 'emissiveIntensity'
  | 'envMapIntensity'
  | 'clearcoat'
  | 'clearcoatRoughness'
  | 'reflectivity'
  | 'shininess'
  | 'aoMapIntensity';
type BooleanMaterialField =
  | 'transparent'
  | 'wireframe'
  | 'depthTest'
  | 'depthWrite'
  | 'castShadow'
  | 'receiveShadow';

const slots: Array<{ id: MaterialTextureSlot; label: string }> = [
  { id: 'baseColor', label: 'Base Color' },
  { id: 'normal', label: 'Normal' },
  { id: 'roughness', label: 'Roughness' },
  { id: 'metalness', label: 'Metalness' },
  { id: 'ao', label: 'AO' },
  { id: 'emissive', label: 'Emissive' },
];

const availableTextures = computed(() =>
  props.textureAssets.filter(
    (asset) =>
      asset.status === 'ready' &&
      (asset.kind === 'image' || asset.kind === 'texture'),
  ),
);

function cloneComponent(): MaterialComponent {
  // Vue 会把嵌套 prop 包装成 Proxy，structuredClone 无法处理 Proxy；协议是纯 JSON，可安全快照。
  return JSON.parse(
    JSON.stringify(props.component ?? createDefaultMaterialComponent()),
  ) as MaterialComponent;
}

function enableMaterial(): void {
  emit('update', createDefaultMaterialComponent());
}

function updateField(
  patch: Partial<Omit<MaterialComponent, 'kind' | 'textures'>>,
): void {
  const next = cloneComponent();
  Object.assign(next, patch);
  emit('update', next);
}

function updateNumber(field: NumericMaterialField, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  const next = cloneComponent();
  next[field] = value;
  // opacity 小于 1 时自动开启混合，避免用户得到“数值已改但画面不透明”的结果。
  if (field === 'opacity' && value < 1) next.transparent = true;
  emit('update', next);
}

function updateBoolean(field: BooleanMaterialField, event: Event): void {
  updateField({
    [field]: (event.target as HTMLInputElement).checked,
  });
}

function updateNormalScale(axis: 0 | 1, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  const next = cloneComponent();
  next.normalScale[axis] = value;
  emit('update', next);
}

function updateTextureAsset(slot: MaterialTextureSlot, event: Event): void {
  const assetId = (event.target as HTMLSelectElement).value;
  const next = cloneComponent();
  const previous = next.textures[slot];
  next.textures[slot] = assetId
    ? {
        assetId,
        offset: [...(previous?.offset ?? [0, 0])],
        repeat: [...(previous?.repeat ?? [1, 1])],
        rotation: previous?.rotation ?? 0,
        wrapS: previous?.wrapS ?? 'repeat',
        wrapT: previous?.wrapT ?? 'repeat',
      }
    : null;
  emit('update', next);
}

function updateTextureAxis(
  slot: MaterialTextureSlot,
  field: 'offset' | 'repeat',
  axis: 0 | 1,
  event: Event,
): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value) || (field === 'repeat' && value === 0)) return;
  const next = cloneComponent();
  const binding = next.textures[slot];
  if (!binding) return;
  binding[field][axis] = value;
  emit('update', next);
}

function updateTextureRotation(slot: MaterialTextureSlot, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  const next = cloneComponent();
  const binding = next.textures[slot];
  if (!binding) return;
  binding.rotation = value;
  emit('update', next);
}

function updateTextureWrap(
  slot: MaterialTextureSlot,
  field: 'wrapS' | 'wrapT',
  event: Event,
): void {
  const next = cloneComponent();
  const binding = next.textures[slot];
  if (!binding) return;
  binding[field] = (event.target as HTMLSelectElement)
    .value as typeof binding.wrapS;
  emit('update', next);
}

function currentTexture(slot: MaterialTextureSlot): Asset | undefined {
  const assetId = props.component?.textures[slot]?.assetId;
  return availableTextures.value.find((asset) => asset.id === assetId);
}
</script>

<template>
  <section class="material-inspector" data-testid="material-inspector">
    <template v-if="!component">
      <p class="material-empty-tip">当前使用模型原始材质</p>
      <button
        type="button"
        class="inspector-action-button"
        data-testid="enable-material"
        :disabled="disabled"
        @click="enableMaterial"
      >
        启用材质覆盖
      </button>
    </template>

    <template v-else>
      <div class="inspector-section-title inspector-section-title--inline">
        <span>材质覆盖</span>
        <button
          type="button"
          class="inspector-text-button"
          data-testid="restore-material"
          :disabled="disabled"
          @click="emit('restore')"
        >
          恢复原始
        </button>
      </div>

      <details class="inspector-fold" open>
        <summary>基础</summary>
        <div class="inspector-field">
          <label for="material-type">材质类型</label>
          <select
            id="material-type"
            data-testid="material-type"
            :value="component.materialType"
            :disabled="disabled"
            @change="
              updateField({
                materialType: ($event.target as HTMLSelectElement)
                  .value as MaterialComponent['materialType'],
              })
            "
          >
            <option value="standard">Standard</option>
            <option value="physical">Physical</option>
            <option value="phong">Phong</option>
            <option value="basic">Basic</option>
          </select>
        </div>
        <div class="inspector-field">
          <label for="material-color">颜色</label>
          <input
            id="material-color"
            type="color"
            :value="component.color"
            :disabled="disabled"
            @change="
              updateField({
                color: ($event.target as HTMLInputElement).value,
              })
            "
          />
        </div>
        <div class="inspector-field">
          <label for="material-opacity">不透明度</label>
          <input
            id="material-opacity"
            data-testid="material-opacity"
            type="number"
            min="0"
            max="1"
            step="0.05"
            :value="component.opacity"
            :disabled="disabled"
            @change="updateNumber('opacity', $event)"
          />
        </div>
        <div class="inspector-field">
          <label for="material-side">渲染面</label>
          <select
            id="material-side"
            data-testid="material-side"
            :value="component.side"
            :disabled="disabled"
            @change="
              updateField({
                side: ($event.target as HTMLSelectElement)
                  .value as MaterialComponent['side'],
              })
            "
          >
            <option value="front">正面</option>
            <option value="back">背面</option>
            <option value="double">双面</option>
          </select>
        </div>
        <div class="inspector-check-grid">
          <label
            v-for="item in [
              ['transparent', '透明混合'],
              ['wireframe', '线框'],
              ['depthTest', '深度测试'],
              ['depthWrite', '深度写入'],
            ] as const"
            :key="item[0]"
          >
            <input
              type="checkbox"
              :checked="component[item[0]]"
              :disabled="disabled"
              @change="updateBoolean(item[0], $event)"
            />
            {{ item[1] }}
          </label>
        </div>
      </details>

      <details class="inspector-fold" open>
        <summary>PBR 参数</summary>
        <template
          v-if="
            component.materialType === 'standard' ||
            component.materialType === 'physical'
          "
        >
          <div class="inspector-field">
            <label>粗糙度</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              :value="component.roughness"
              :disabled="disabled"
              @change="updateNumber('roughness', $event)"
            />
          </div>
          <div class="inspector-field">
            <label>金属度</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              :value="component.metalness"
              :disabled="disabled"
              @change="updateNumber('metalness', $event)"
            />
          </div>
          <div class="inspector-field">
            <label>环境反射</label>
            <input
              type="number"
              min="0"
              step="0.1"
              :value="component.envMapIntensity"
              :disabled="disabled"
              @change="updateNumber('envMapIntensity', $event)"
            />
          </div>
        </template>
        <template v-if="component.materialType !== 'basic'">
          <div class="inspector-field">
            <label>发光颜色</label>
            <input
              type="color"
              :value="component.emissive"
              :disabled="disabled"
              @change="
                updateField({
                  emissive: ($event.target as HTMLInputElement).value,
                })
              "
            />
          </div>
          <div class="inspector-field">
            <label>发光强度</label>
            <input
              type="number"
              min="0"
              step="0.1"
              :value="component.emissiveIntensity"
              :disabled="disabled"
              @change="updateNumber('emissiveIntensity', $event)"
            />
          </div>
        </template>
        <template v-if="component.materialType === 'physical'">
          <div class="inspector-field">
            <label>清漆</label>
            <input
              data-testid="material-clearcoat"
              type="number"
              min="0"
              max="1"
              step="0.05"
              :value="component.clearcoat"
              :disabled="disabled"
              @change="updateNumber('clearcoat', $event)"
            />
          </div>
          <div class="inspector-field">
            <label>清漆粗糙</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              :value="component.clearcoatRoughness"
              :disabled="disabled"
              @change="updateNumber('clearcoatRoughness', $event)"
            />
          </div>
          <div class="inspector-field">
            <label>反射率</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              :value="component.reflectivity"
              :disabled="disabled"
              @change="updateNumber('reflectivity', $event)"
            />
          </div>
        </template>
        <template v-if="component.materialType === 'phong'">
          <div class="inspector-field">
            <label>高光颜色</label>
            <input
              type="color"
              :value="component.specular"
              :disabled="disabled"
              @change="
                updateField({
                  specular: ($event.target as HTMLInputElement).value,
                })
              "
            />
          </div>
          <div class="inspector-field">
            <label>光泽度</label>
            <input
              type="number"
              min="0"
              step="1"
              :value="component.shininess"
              :disabled="disabled"
              @change="updateNumber('shininess', $event)"
            />
          </div>
        </template>
        <template v-if="component.materialType !== 'basic'">
          <div class="inspector-field inspector-field--vector2">
            <label>法线强度</label>
            <div class="vector2-inputs">
              <input
                type="number"
                step="0.1"
                :value="component.normalScale[0]"
                :disabled="disabled"
                aria-label="法线 X"
                @change="updateNormalScale(0, $event)"
              />
              <input
                type="number"
                step="0.1"
                :value="component.normalScale[1]"
                :disabled="disabled"
                aria-label="法线 Y"
                @change="updateNormalScale(1, $event)"
              />
            </div>
          </div>
        </template>
        <div class="inspector-field">
          <label>AO 强度</label>
          <input
            type="number"
            min="0"
            step="0.1"
            :value="component.aoMapIntensity"
            :disabled="disabled"
            @change="updateNumber('aoMapIntensity', $event)"
          />
        </div>
      </details>

      <details class="inspector-fold" open>
        <summary>阴影</summary>
        <div class="inspector-check-grid">
          <label>
            <input
              type="checkbox"
              :checked="component.castShadow"
              :disabled="disabled"
              @change="updateBoolean('castShadow', $event)"
            />
            投射阴影
          </label>
          <label>
            <input
              type="checkbox"
              :checked="component.receiveShadow"
              :disabled="disabled"
              @change="updateBoolean('receiveShadow', $event)"
            />
            接收阴影
          </label>
        </div>
      </details>

      <details class="inspector-fold material-textures" open>
        <summary>
          <span>贴图与 UV</span>
          <a href="/assets" target="_blank">素材管理</a>
        </summary>
        <details v-for="slot in slots" :key="slot.id" class="texture-slot">
          <summary>{{ slot.label }}</summary>
          <div class="texture-select-row">
            <img
              v-if="currentTexture(slot.id)?.thumbnailUrl"
              :src="currentTexture(slot.id)?.thumbnailUrl ?? ''"
              :alt="slot.label"
            />
            <select
              :data-testid="`texture-${slot.id}`"
              :value="component.textures[slot.id]?.assetId ?? ''"
              :disabled="disabled"
              @change="updateTextureAsset(slot.id, $event)"
            >
              <option value="">无贴图</option>
              <option
                v-for="asset in availableTextures"
                :key="asset.id"
                :value="asset.id"
              >
                {{ asset.name }}
              </option>
            </select>
          </div>
          <template v-if="component.textures[slot.id]">
            <div class="texture-transform-grid">
              <label>
                偏移 X
                <input
                  type="number"
                  step="0.05"
                  :value="component.textures[slot.id]!.offset[0]"
                  :disabled="disabled"
                  @change="updateTextureAxis(slot.id, 'offset', 0, $event)"
                />
              </label>
              <label>
                偏移 Y
                <input
                  type="number"
                  step="0.05"
                  :value="component.textures[slot.id]!.offset[1]"
                  :disabled="disabled"
                  @change="updateTextureAxis(slot.id, 'offset', 1, $event)"
                />
              </label>
              <label>
                重复 X
                <input
                  :data-testid="`texture-${slot.id}-repeat-x`"
                  type="number"
                  step="0.1"
                  :value="component.textures[slot.id]!.repeat[0]"
                  :disabled="disabled"
                  @change="updateTextureAxis(slot.id, 'repeat', 0, $event)"
                />
              </label>
              <label>
                重复 Y
                <input
                  type="number"
                  step="0.1"
                  :value="component.textures[slot.id]!.repeat[1]"
                  :disabled="disabled"
                  @change="updateTextureAxis(slot.id, 'repeat', 1, $event)"
                />
              </label>
              <label>
                旋转(rad)
                <input
                  type="number"
                  step="0.05"
                  :value="component.textures[slot.id]!.rotation"
                  :disabled="disabled"
                  @change="updateTextureRotation(slot.id, $event)"
                />
              </label>
              <label>
                横向包裹
                <select
                  :value="component.textures[slot.id]!.wrapS"
                  :disabled="disabled"
                  @change="updateTextureWrap(slot.id, 'wrapS', $event)"
                >
                  <option value="repeat">Repeat</option>
                  <option value="clamp">Clamp</option>
                  <option value="mirror">Mirror</option>
                </select>
              </label>
              <label>
                纵向包裹
                <select
                  :value="component.textures[slot.id]!.wrapT"
                  :disabled="disabled"
                  @change="updateTextureWrap(slot.id, 'wrapT', $event)"
                >
                  <option value="repeat">Repeat</option>
                  <option value="clamp">Clamp</option>
                  <option value="mirror">Mirror</option>
                </select>
              </label>
            </div>
          </template>
        </details>
      </details>
    </template>
  </section>
</template>
