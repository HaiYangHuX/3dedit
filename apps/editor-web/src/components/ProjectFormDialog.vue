<script setup lang="ts">
import type {
  CreateProjectInput,
  ProjectDetail,
  ProjectSummary,
  UpdateProjectInput,
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
    project?: ProjectDetail | ProjectSummary | null;
    submitting?: boolean;
    /** 允许同一页面同时挂载创建和编辑弹窗而不产生重复测试标识。 */
    testId?: string;
  }>(),
  {
    mode: 'create',
    project: null,
    submitting: false,
    testId: 'project-dialog',
  },
);
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [value: CreateProjectInput | UpdateProjectInput];
}>();

const uploadingCover = ref(false);
const coverFile = ref<File | null>(null);
const coverChanged = ref(false);
const form = reactive({
  name: '',
  description: '',
  code: '',
  coverKey: '',
});

const title = computed(() =>
  props.mode === 'create' ? '创建数字孪生项目' : '编辑项目资料',
);
const busy = computed(() => props.submitting || uploadingCover.value);

function resetForm(): void {
  coverFile.value = null;
  coverChanged.value = false;
  const project = props.project;
  form.name = project?.name ?? '';
  form.description = project?.description ?? '';
  form.code = project?.code ?? '';
  form.coverKey = project?.coverKey ?? '';
}

watch(
  () => [props.modelValue, props.project, props.mode],
  ([visible]) => {
    // 每次打开都从 DTO 初始化，避免取消编辑后残留上一次输入。
    if (visible) resetForm();
  },
  { immediate: true },
);

function close(): void {
  if (!busy.value) emit('update:modelValue', false);
}

function onCoverChange(file: File | null): void {
  coverFile.value = file;
  coverChanged.value = true;
  if (!file) form.coverKey = '';
}

async function uploadCover(): Promise<string | null | undefined> {
  if (!coverChanged.value) return undefined;
  if (!coverFile.value) return null;
  const stored = await uploadCoverFile(coverFile.value, 'project-cover');
  return stored.objectKey;
}

async function submit(): Promise<void> {
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning('请输入项目名称');
    return;
  }
  uploadingCover.value = true;
  try {
    const coverKey = await uploadCover();
    const input = {
      name,
      description: form.description.trim(),
      code: form.code.trim(),
    } as CreateProjectInput & UpdateProjectInput;
    // 编辑时 undefined 表示保持原封面，null 表示用户主动移除；创建时同样可省略。
    if (coverKey !== undefined) input.coverKey = coverKey;
    emit('submit', input);
  } catch (reason) {
    ElMessage.error(
      reason instanceof Error ? reason.message : '项目封面上传失败',
    );
  } finally {
    uploadingCover.value = false;
  }
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    width="min(680px, calc(100vw - 32px))"
    destroy-on-close
    class="project-form-dialog"
    :data-testid="testId"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="resetForm"
  >
    <ElForm label-position="top" class="project-form" @submit.prevent="submit">
      <div class="project-form-section">
        <div class="project-form-section__heading">
          <strong>基础信息</strong>
        </div>
        <div class="project-form-grid project-form-grid--two">
          <ElFormItem label="项目名称" required>
            <ElInput
              v-model="form.name"
              maxlength="80"
              show-word-limit
              placeholder="例如：智能工厂一期"
            />
          </ElFormItem>
          <ElFormItem label="项目编码">
            <ElInput
              v-model="form.code"
              maxlength="80"
              placeholder="留空将自动生成"
            />
          </ElFormItem>
        </div>
        <ElFormItem label="项目描述">
          <ElInput
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="简要说明项目目标和范围"
          />
        </ElFormItem>
      </div>

      <div class="project-form-section">
        <div class="project-form-section__heading">
          <strong>项目封面</strong>
        </div>
        <ElFormItem label="封面图片">
          <CoverImagePicker
            v-model="coverFile"
            :src="form.coverKey.startsWith('http') ? form.coverKey : ''"
            :fallback="form.name.slice(0, 1) || '项'"
            :disabled="busy"
            @change="onCoverChange"
          />
        </ElFormItem>
      </div>
    </ElForm>
    <template #footer>
      <ElButton :disabled="busy" @click="close">取消</ElButton>
      <ElButton type="primary" :loading="busy" @click="submit">
        {{ mode === 'create' ? '创建' : '保存修改' }}
      </ElButton>
    </template>
  </ElDialog>
</template>
