<script setup lang="ts">
import { ArrowLeft, RefreshLeft } from '@element-plus/icons-vue';

const props = withDefaults(
  defineProps<{
    sceneName: string;
    saveStateLabel: string;
    saveStateError?: boolean;
    saving?: boolean;
    publishing?: boolean;
    showReload?: boolean;
  }>(),
  {
    saveStateError: false,
    saving: false,
    publishing: false,
    showReload: false,
  },
);
const emit = defineEmits<{
  'back-to-project': [];
  reset: [];
  save: [];
  reload: [];
  preview: [];
  publish: [];
}>();
</script>

<template>
  <header class="top-toolbar" data-testid="top-toolbar">
    <div class="top-toolbar-leading">
      <button
        type="button"
        class="top-back-button"
        data-testid="back-to-project"
        title="返回项目"
        @click="emit('back-to-project')"
      >
        <ArrowLeft class="top-action-icon" aria-hidden="true" />
        <span>返回项目</span>
      </button>
      <div class="brand-block">
        <span class="brand-mark">DT</span>
        <strong>数字孪生编辑器</strong>
        <span class="scene-name" :title="props.sceneName">{{
          props.sceneName
        }}</span>
        <span class="three-version">Three r183</span>
      </div>
    </div>
    <div class="top-toolbar-actions">
      <span
        class="top-save-state"
        :class="{ 'save-state--error': props.saveStateError }"
      >
        <i />{{ props.saveStateLabel }}
      </span>
      <button
        type="button"
        data-testid="reset-scene"
        title="重置场景"
        @click="emit('reset')"
      >
        <RefreshLeft class="top-action-icon" aria-hidden="true" />
        <span>重置场景</span>
      </button>
      <button
        type="button"
        data-testid="save-scene"
        :disabled="props.saving"
        @click="emit('save')"
      >
        ◉ <span>{{ props.saving ? '保存中' : '保存' }}</span>
      </button>
      <button v-if="props.showReload" type="button" @click="emit('reload')">
        重新加载
      </button>
      <span class="top-toolbar-divider" />
      <button
        type="button"
        data-testid="preview-scene"
        @click="emit('preview')"
      >
        ▷ <span>预览</span>
      </button>
      <button
        type="button"
        class="top-publish-button"
        data-testid="publish-scene"
        :disabled="props.publishing"
        @click="emit('publish')"
      >
        {{ props.publishing ? '发布中' : '发布' }}
      </button>
    </div>
  </header>
</template>
