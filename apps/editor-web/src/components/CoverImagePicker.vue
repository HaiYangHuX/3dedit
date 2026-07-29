<script setup lang="ts">
import { Delete, Upload, ZoomIn } from '@element-plus/icons-vue';
import {
  ElButton,
  ElIcon,
  ElImage,
  ElMessage,
  ElTag,
  ElUpload,
  type UploadFile,
} from 'element-plus';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: File | null;
    src?: string;
    fallback?: string;
    disabled?: boolean;
  }>(),
  { src: '', fallback: '封', disabled: false },
);

const emit = defineEmits<{
  'update:modelValue': [file: File | null];
  change: [file: File | null];
}>();

const imageRef = ref<{ showPreview: () => void } | null>(null);
const previewUrl = ref('');
const displaySrc = computed(() => previewUrl.value || props.src);

function revokePreview(): void {
  if (!previewUrl.value) return;
  URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

watch(
  () => props.modelValue,
  (file) => {
    revokePreview();
    if (file) previewUrl.value = URL.createObjectURL(file);
  },
  { immediate: true },
);

onBeforeUnmount(revokePreview);

function onFileChange(file: UploadFile): void {
  const raw = file.raw;
  if (!raw) return;
  const extension = raw.name.split('.').at(-1)?.toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '')) {
    ElMessage.error('封面仅支持 JPG、PNG、WebP 图片');
    return;
  }
  if (raw.size > 8 * 1024 * 1024) {
    ElMessage.error('封面图片不能超过 8MB');
    return;
  }
  emit('update:modelValue', raw);
  emit('change', raw);
}

function remove(): void {
  emit('update:modelValue', null);
  emit('change', null);
}

function showPreview(): void {
  imageRef.value?.showPreview();
}
</script>

<template>
  <div class="cover-image-picker" data-testid="cover-image-picker">
    <div class="cover-image-picker__preview">
      <ElImage
        v-if="displaySrc"
        ref="imageRef"
        :src="displaySrc"
        :preview-src-list="[displaySrc]"
        fit="cover"
        preview-teleported
        alt="封面预览"
      />
      <span v-else>{{ fallback.slice(0, 1) || '封' }}</span>
      <ElButton
        v-if="displaySrc"
        class="cover-image-picker__zoom"
        text
        circle
        aria-label="放大预览"
        title="放大预览"
        @click="showPreview"
      >
        <ElIcon><ZoomIn /></ElIcon>
      </ElButton>
    </div>
    <div class="cover-image-picker__controls">
      <div class="cover-image-picker__buttons">
        <ElUpload
          :auto-upload="false"
          :show-file-list="false"
          accept=".jpg,.jpeg,.png,.webp"
          :disabled="disabled"
          :on-change="onFileChange"
        >
          <ElButton :disabled="disabled">
            <ElIcon><Upload /></ElIcon>
            {{ displaySrc ? '更换封面' : '上传封面' }}
          </ElButton>
        </ElUpload>
        <ElButton
          v-if="displaySrc"
          text
          type="danger"
          :disabled="disabled"
          aria-label="移除封面"
          @click="remove"
        >
          <ElIcon><Delete /></ElIcon>
          移除
        </ElButton>
      </div>
      <ElTag v-if="modelValue" type="success">{{ modelValue.name }}</ElTag>
      <span v-else class="cover-image-picker__hint">
        支持 JPG、PNG、WebP，最大 8MB
      </span>
    </div>
  </div>
</template>
