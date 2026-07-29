<script setup lang="ts">
import type {
  CreateSceneInput,
  SceneDetail,
  SceneSummary,
  UpdateSceneInput,
} from '@digital-twin/api-contracts';
import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
} from 'element-plus';
import { computed, reactive, ref, watch } from 'vue';
import { uploadCoverFile } from '../uploads/coverUpload';
import CoverImagePicker from './CoverImagePicker.vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: 'create' | 'edit';
    scene?: SceneSummary | SceneDetail | null;
    submitting?: boolean;
    testId?: string;
  }>(),
  {
    mode: 'create',
    scene: null,
    submitting: false,
    testId: 'scene-form-dialog',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [value: CreateSceneInput | UpdateSceneInput];
}>();

const uploadingCover = ref(false);
const coverFile = ref<File | null>(null);
const coverChanged = ref(false);
const form = reactive({ name: '', description: '', coverKey: '' });

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
const busy = computed(() => props.submitting || uploadingCover.value);
const title = computed(() =>
  props.mode === 'create' ? '创建场景' : '编辑场景',
);

function resetForm(scene: SceneSummary | SceneDetail | null): void {
  coverFile.value = null;
  coverChanged.value = false;
  form.name = scene?.name ?? '';
  form.description = scene?.description ?? '';
  form.coverKey = scene?.coverKey ?? '';
}

watch(
  () => [props.modelValue, props.mode, props.scene] as const,
  ([open, , scene]) => {
    // 每次打开都回填服务端快照，取消编辑不会污染下一次创建。
    if (open) resetForm(scene);
  },
  { immediate: true },
);

function close(): void {
  if (!busy.value) visible.value = false;
}

function onCoverChange(file: File | null): void {
  coverFile.value = file;
  coverChanged.value = true;
  if (!file) form.coverKey = '';
}

async function uploadCover(): Promise<string | null | undefined> {
  if (!coverChanged.value) return undefined;
  if (!coverFile.value) return null;
  const stored = await uploadCoverFile(coverFile.value, 'scene-cover');
  return stored.objectKey;
}

async function submit(): Promise<void> {
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning('请输入场景名称');
    return;
  }
  uploadingCover.value = true;
  try {
    const coverKey = await uploadCover();
    const input = {
      name,
      description: form.description.trim(),
    } as CreateSceneInput & UpdateSceneInput;
    // undefined 表示保持编辑时的原值，null 表示用户主动移除封面。
    if (coverKey !== undefined) input.coverKey = coverKey;
    emit('submit', input);
  } catch (reason) {
    ElMessage.error(
      reason instanceof Error ? reason.message : '场景封面上传失败',
    );
  } finally {
    uploadingCover.value = false;
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="title"
    width="min(520px, calc(100vw - 32px))"
    destroy-on-close
    class="scene-form-dialog"
    :data-testid="testId"
    :close-on-click-modal="false"
  >
    <ElForm label-position="top" class="scene-form" @submit.prevent="submit">
      <ElFormItem label="场景名称" required>
        <ElInput
          v-model="form.name"
          maxlength="80"
          show-word-limit
          placeholder="例如：主厂房总览"
        />
      </ElFormItem>
      <ElFormItem label="场景描述">
        <ElInput
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
          placeholder="简要说明场景用途和范围"
        />
      </ElFormItem>
      <ElFormItem label="场景封面">
        <CoverImagePicker
          v-model="coverFile"
          :src="form.coverKey.startsWith('http') ? form.coverKey : ''"
          :fallback="form.name.slice(0, 1) || '场'"
          :disabled="busy"
          @change="onCoverChange"
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton :disabled="busy" @click="close">取消</ElButton>
      <ElButton type="primary" :loading="busy" @click="submit">
        {{ mode === 'create' ? '创建场景' : '保存修改' }}
      </ElButton>
    </template>
  </ElDialog>
</template>
