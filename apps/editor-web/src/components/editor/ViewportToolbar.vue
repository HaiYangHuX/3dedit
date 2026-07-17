<script setup lang="ts">
import {
  Avatar,
  Bottom,
  Camera,
  EditPen,
  Open,
  Rank,
  RefreshRight,
  ScaleToOriginal,
  TurnOff,
  UserFilled,
} from '@element-plus/icons-vue';
import { ElTooltip } from 'element-plus';

const props = defineProps<{
  mode: 'translate' | 'rotate' | 'scale';
  isPointerLock: boolean;
  isMeasuring: boolean;
  isChooseAllModel: boolean;
}>();

const emit = defineEmits<{
  mode: [mode: 'translate' | 'rotate' | 'scale'];
  'align-ground': [];
  'pointer-lock': [active: boolean];
  measure: [active: boolean];
  reset: [];
  'choose-all': [active: boolean];
}>();
</script>

<template>
  <div class="viewport-tools" role="toolbar" aria-label="视口工具">
    <div class="viewport-tool-group">
      <!-- Tooltip 统一由 Element Plus 接管，按钮只保留 aria-label 避免原生提示重复弹出。 -->
      <ElTooltip content="拖拽（快捷键：W）" placement="top">
        <button
          type="button"
          class="transform-controls-item"
          data-tool="translate"
          aria-label="拖拽（快捷键：W）"
          :class="{ active: props.mode === 'translate' }"
          @click="emit('mode', 'translate')"
        >
          <Rank class="viewport-element-icon" aria-hidden="true" />
        </button>
      </ElTooltip>
      <ElTooltip content="旋转（快捷键：E）" placement="top">
        <button
          type="button"
          class="transform-controls-item"
          data-tool="rotate"
          aria-label="旋转（快捷键：E）"
          :class="{ active: props.mode === 'rotate' }"
          @click="emit('mode', 'rotate')"
        >
          <RefreshRight class="viewport-element-icon" aria-hidden="true" />
        </button>
      </ElTooltip>
      <ElTooltip content="缩放（快捷键：R）" placement="top">
        <button
          type="button"
          class="transform-controls-item"
          data-tool="scale"
          aria-label="缩放（快捷键：R）"
          :class="{ active: props.mode === 'scale' }"
          @click="emit('mode', 'scale')"
        >
          <ScaleToOriginal class="viewport-element-icon" aria-hidden="true" />
        </button>
      </ElTooltip>
      <ElTooltip content="对齐所有模型到地面" placement="top">
        <button
          type="button"
          class="transform-controls-item"
          data-tool="align-ground"
          aria-label="对齐所有模型到地面"
          @click="emit('align-ground')"
        >
          <Bottom class="viewport-element-icon" aria-hidden="true" />
        </button>
      </ElTooltip>
    </div>

    <span class="viewport-tool-divider" aria-hidden="true" />

    <div class="viewport-tool-group">
      <ElTooltip
        :content="
          props.isPointerLock ? '当前视角：第一人称' : '当前视角：第三人称'
        "
        placement="top"
      >
        <button
          type="button"
          class="transform-controls-item"
          data-tool="pointer-lock"
          :class="{ active: props.isPointerLock }"
          :aria-label="
            props.isPointerLock ? '退出第一人称视角' : '进入第一人称视角'
          "
          @click="emit('pointer-lock', !props.isPointerLock)"
        >
          <UserFilled
            v-if="props.isPointerLock"
            class="viewport-element-icon"
            aria-hidden="true"
          />
          <Avatar v-else class="viewport-element-icon" aria-hidden="true" />
        </button>
      </ElTooltip>
      <ElTooltip content="测量工具" placement="top">
        <button
          type="button"
          class="transform-controls-item"
          data-tool="measure"
          :class="{ active: props.isMeasuring }"
          :aria-label="props.isMeasuring ? '结束测量工具' : '测量工具'"
          @click="emit('measure', !props.isMeasuring)"
        >
          <EditPen class="viewport-element-icon" aria-hidden="true" />
        </button>
      </ElTooltip>
      <ElTooltip content="重置场景相机位置(鼠标无法控制相机时)" placement="top">
        <button
          type="button"
          class="transform-controls-item"
          data-tool="reset-camera"
          aria-label="重置场景相机位置"
          @click="emit('reset')"
        >
          <Camera class="viewport-element-icon" aria-hidden="true" />
        </button>
      </ElTooltip>
      <ElTooltip
        :content="`鼠标单击选中整个模型:${props.isChooseAllModel ? '已开启' : '已关闭'}`"
        placement="top"
      >
        <button
          type="button"
          class="transform-controls-item"
          data-tool="choose-all"
          :class="{ active: props.isChooseAllModel }"
          :aria-label="`鼠标单击选中整个模型：${props.isChooseAllModel ? '已开启' : '已关闭'}`"
          @click="emit('choose-all', !props.isChooseAllModel)"
        >
          <TurnOff
            v-if="props.isChooseAllModel"
            class="viewport-element-icon"
            aria-hidden="true"
          />
          <Open v-else class="viewport-element-icon" aria-hidden="true" />
        </button>
      </ElTooltip>
    </div>

    <div v-if="props.isMeasuring" class="measurement-status">
      测量工具已打开 按 Esc 键退出测量模式
    </div>
  </div>
</template>
