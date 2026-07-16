<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    sceneName: string;
    saveStateLabel: string;
    saveStateError?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    saving?: boolean;
    publishing?: boolean;
    showReload?: boolean;
  }>(),
  {
    saveStateError: false,
    canUndo: false,
    canRedo: false,
    saving: false,
    publishing: false,
    showReload: false,
  },
);
const emit = defineEmits<{
  undo: [];
  redo: [];
  save: [];
  reload: [];
  preview: [];
  publish: [];
}>();
</script>

<template>
  <header class="top-toolbar" data-testid="top-toolbar">
    <div class="brand-block">
      <span class="brand-mark">DT</span>
      <strong>数字孪生编辑器</strong>
      <span class="scene-name" :title="props.sceneName">{{
        props.sceneName
      }}</span>
      <span class="three-version">Three r183</span>
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
        data-testid="undo-scene"
        title="撤销 Ctrl/⌘+Z"
        :disabled="!props.canUndo"
        @click="emit('undo')"
      >
        ↶ <span>撤销</span>
      </button>
      <button
        type="button"
        data-testid="redo-scene"
        title="重做 Ctrl/⌘+Shift+Z"
        :disabled="!props.canRedo"
        @click="emit('redo')"
      >
        ↷ <span>重做</span>
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
