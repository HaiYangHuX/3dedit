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
  ElTag,
  ElUpload,
  type UploadFile,
} from 'element-plus';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { assetApi } from '../api/assets';
import { useAssetStore } from '../stores/asset';

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

const assetStore = useAssetStore();
const uploadingCover = ref(false);
const coverFile = ref<File | null>(null);
const coverPreviewUrl = ref('');
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
const coverSource = computed(() => {
  if (coverPreviewUrl.value) return coverPreviewUrl.value;
  return form.coverKey.startsWith('http') ? form.coverKey : '';
});
const hasCover = computed(() => Boolean(coverSource.value));

function revokePreview(): void {
  if (!coverPreviewUrl.value) return;
  URL.revokeObjectURL(coverPreviewUrl.value);
  coverPreviewUrl.value = '';
}

function resetForm(): void {
  revokePreview();
  coverFile.value = null;
  coverChanged.value = false;
  const project = props.project;
  form.name = project?.name ?? '';
  form.description = project?.description ?? '';
  form.code = project?.code ?? '';
  form.coverKey = project?.coverKey ?? '';
}

onBeforeUnmount(revokePreview);

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

function onCoverChange(file: UploadFile): void {
  const raw = file.raw;
  if (!raw) return;
  const extension = raw.name.split('.').at(-1)?.toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '')) {
    ElMessage.error('项目封面仅支持 JPG、PNG、WebP 图片');
    return;
  }
  if (raw.size > 8 * 1024 * 1024) {
    ElMessage.error('项目封面不能超过 8MB');
    return;
  }
  revokePreview();
  coverFile.value = raw;
  coverChanged.value = true;
  coverPreviewUrl.value = URL.createObjectURL(raw);
}

function clearCover(): void {
  revokePreview();
  coverFile.value = null;
  form.coverKey = '';
  coverChanged.value = true;
}

async function uploadCover(): Promise<string | null | undefined> {
  if (!coverChanged.value) return undefined;
  if (!coverFile.value) return null;
  const task = await assetStore.uploadFile(coverFile.value, {
    name: `${form.name.trim()}-项目封面`,
    category: '项目封面',
    pollInterval: 1_000,
  });
  if (!task.assetId) throw new Error('项目封面上传完成但未返回资源编号');
  const asset = await assetApi.get(task.assetId);
  return asset.coverUrl ?? asset.thumbnailUrl ?? null;
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
          <div class="project-cover-picker">
            <div class="project-cover-picker__preview">
              <img v-if="coverSource" :src="coverSource" alt="项目封面预览" />
              <span v-else>{{ form.name.slice(0, 1) || '项' }}</span>
            </div>
            <div class="project-cover-picker__controls">
              <div class="project-cover-picker__buttons">
                <ElUpload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept=".jpg,.jpeg,.png,.webp"
                  :on-change="onCoverChange"
                >
                  <ElButton :disabled="busy">
                    {{ hasCover ? '更换封面' : '上传封面' }}
                  </ElButton>
                </ElUpload>
                <ElButton
                  v-if="hasCover"
                  text
                  type="danger"
                  :disabled="busy"
                  @click="clearCover"
                >
                  移除
                </ElButton>
              </div>
              <ElTag v-if="coverFile" type="success">{{
                coverFile.name
              }}</ElTag>
              <span v-else class="project-cover-picker__hint"
                >支持 JPG、PNG、WebP，最大 8MB</span
              >
            </div>
          </div>
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
