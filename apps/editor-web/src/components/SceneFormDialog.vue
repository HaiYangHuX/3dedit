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

const assetStore = useAssetStore();
const uploadingCover = ref(false);
const coverFile = ref<File | null>(null);
const coverPreviewUrl = ref('');
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
const coverSource = computed(() => {
  if (coverPreviewUrl.value) return coverPreviewUrl.value;
  return form.coverKey.startsWith('http') ? form.coverKey : '';
});
const hasCover = computed(() => Boolean(coverSource.value));
const coverName = computed(
  () => coverFile.value?.name ?? '未上传，使用默认封面',
);

function revokePreview(): void {
  if (!coverPreviewUrl.value) return;
  URL.revokeObjectURL(coverPreviewUrl.value);
  coverPreviewUrl.value = '';
}

function resetForm(scene: SceneSummary | SceneDetail | null): void {
  revokePreview();
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

onBeforeUnmount(revokePreview);

function close(): void {
  if (!busy.value) visible.value = false;
}

function onCoverChange(file: UploadFile): void {
  const raw = file.raw;
  if (!raw) return;
  const extension = raw.name.split('.').at(-1)?.toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '')) {
    ElMessage.error('场景封面仅支持 JPG、PNG、WebP 图片');
    return;
  }
  if (raw.size > 8 * 1024 * 1024) {
    ElMessage.error('场景封面不能超过 8MB');
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
    name: `${form.name.trim()}-场景封面`,
    category: '场景封面',
    pollInterval: 1_000,
  });
  if (!task.assetId) throw new Error('场景封面上传完成但未返回资源编号');
  const asset = await assetApi.get(task.assetId);
  return asset.coverUrl ?? asset.thumbnailUrl ?? null;
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
        <div class="scene-cover-picker">
          <div class="scene-cover-picker__preview">
            <img v-if="coverSource" :src="coverSource" alt="场景封面预览" />
            <span v-else>{{ form.name.slice(0, 1) || '场' }}</span>
          </div>
          <div class="scene-cover-picker__controls">
            <div class="scene-cover-picker__buttons">
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
            <ElTag v-if="coverFile" type="success">{{ coverName }}</ElTag>
            <span v-else class="scene-cover-picker__hint"
              >支持 JPG、PNG、WebP，最大 8MB</span
            >
          </div>
        </div>
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
