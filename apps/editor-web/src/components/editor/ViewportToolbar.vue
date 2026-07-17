<script setup lang="ts">
import { Bottom, EditPen, Open, TurnOff } from '@element-plus/icons-vue';

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
      <button
        type="button"
        class="transform-controls-item"
        data-tool="translate"
        title="拖拽（快捷键：W）"
        aria-label="拖拽（快捷键：W）"
        :class="{ active: props.mode === 'translate' }"
        @click="emit('mode', 'translate')"
      >
        <span class="iconfont icon-tuozhuai" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="transform-controls-item"
        data-tool="rotate"
        title="旋转（快捷键：E）"
        aria-label="旋转（快捷键：E）"
        :class="{ active: props.mode === 'rotate' }"
        @click="emit('mode', 'rotate')"
      >
        <span class="iconfont icon-xuanzhuan" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="transform-controls-item"
        data-tool="scale"
        title="缩放（快捷键：R）"
        aria-label="缩放（快捷键：R）"
        :class="{ active: props.mode === 'scale' }"
        @click="emit('mode', 'scale')"
      >
        <span class="iconfont icon-suofang" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="transform-controls-item"
        data-tool="align-ground"
        title="对齐所有模型到地面"
        aria-label="对齐所有模型到地面"
        @click="emit('align-ground')"
      >
        <Bottom class="viewport-element-icon" aria-hidden="true" />
      </button>
    </div>

    <span class="viewport-tool-divider" aria-hidden="true" />

    <div class="viewport-tool-group">
      <button
        type="button"
        class="transform-controls-item"
        data-tool="pointer-lock"
        :class="{ active: props.isPointerLock }"
        :title="
          props.isPointerLock ? '当前视角：第一人称' : '当前视角：第三人称'
        "
        :aria-label="
          props.isPointerLock ? '退出第一人称视角' : '进入第一人称视角'
        "
        @click="emit('pointer-lock', !props.isPointerLock)"
      >
        <span
          v-if="props.isPointerLock"
          class="iconfont icon-shubiaozhizhen-diyirenchengmanyou-yidong"
          aria-hidden="true"
        />
        <span
          v-else
          class="iconfont icon-a-disanrencheng1x"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="transform-controls-item"
        data-tool="measure"
        :class="{ active: props.isMeasuring }"
        :title="props.isMeasuring ? '结束测量工具' : '测量工具'"
        :aria-label="props.isMeasuring ? '结束测量工具' : '测量工具'"
        @click="emit('measure', !props.isMeasuring)"
      >
        <EditPen class="viewport-element-icon" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="transform-controls-item"
        data-tool="reset-camera"
        title="重置场景相机位置（鼠标无法控制相机时）"
        aria-label="重置场景相机位置"
        @click="emit('reset')"
      >
        <span class="iconfont icon-24gf-camera2" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="transform-controls-item"
        data-tool="choose-all"
        :class="{ active: props.isChooseAllModel }"
        :title="`鼠标单击选中整个模型：${props.isChooseAllModel ? '已开启' : '已关闭'}`"
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
    </div>

    <div v-if="props.isMeasuring" class="measurement-status">
      测量工具已打开 按 Esc 键退出测量模式
    </div>
  </div>
</template>
