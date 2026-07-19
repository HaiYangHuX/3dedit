<script setup lang="ts">
import type { Asset } from '@digital-twin/api-contracts';
import {
  ElButton,
  ElDialog,
  ElDivider,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElTag,
  ElUpload,
  type UploadFile,
} from 'element-plus';
import { computed, reactive, ref, watch } from 'vue';
import { useAssetStore } from '../stores/asset';

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    /** 传入资源时进入编辑模式；不传资源时为添加模式。 */
    asset?: Asset | null;
  }>(),
  { modelValue: false, asset: null },
);
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 保存完成后告知页面是否产生了上传任务。 */
  saved: [uploaded: boolean];
}>();

const store = useAssetStore();
const submitting = ref(false);
const sourceFile = ref<File | null>(null);
const coverFile = ref<File | null>(null);
const isEdit = computed(() => Boolean(props.asset?.id));

const form = reactive({
  name: '',
  code: '',
  category: '设备模型',
  description: '',
  version: '1.0.0',
  author: '',
  manufacturer: '',
  license: '内部资产',
  unit: 'm',
  scale: 1,
  visibility: 'private' as 'private' | 'team' | 'public',
});

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const sourceName = computed(() => {
  if (sourceFile.value) return sourceFile.value.name;
  return isEdit.value
    ? '未选择新文件，将保留当前源文件'
    : '请选择 GLB / GLTF / FBX 等源文件';
});
const coverName = computed(() => {
  if (coverFile.value) return coverFile.value.name;
  return isEdit.value
    ? '未选择新封面，将保留当前封面'
    : '未设置，将使用解析缩略图';
});

function resetForm(asset: Asset | null): void {
  sourceFile.value = null;
  coverFile.value = null;
  form.name = asset?.name ?? '';
  form.code = asset?.code ?? '';
  form.category = asset?.category ?? '设备模型';
  form.description = asset?.description ?? '';
  // 版本是普通文本元数据，编辑时回填当前值，不自动递增。
  form.version = asset?.version ?? '1.0.0';
  form.author = asset?.author ?? '';
  form.manufacturer = asset?.manufacturer ?? '';
  form.license = asset?.license ?? '内部资产';
  form.unit = asset?.unit ?? 'm';
  form.scale = asset?.scale ?? 1;
  form.visibility = asset?.visibility ?? 'private';
}

watch(
  () => [props.modelValue, props.asset] as const,
  ([open, asset]) => {
    if (open) resetForm(asset);
  },
  { immediate: true },
);

function onSourceChange(file: UploadFile): void {
  sourceFile.value = file.raw ?? null;
  if (!form.name && sourceFile.value) {
    form.name = sourceFile.value.name.replace(/\.[^.]+$/, '');
  }
}

function onCoverChange(file: UploadFile): void {
  coverFile.value = file.raw ?? null;
}

function close(): void {
  if (!submitting.value) visible.value = false;
}

function metadataInput(coverAssetId?: string | null) {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    description: form.description.trim(),
    version: form.version.trim(),
    author: form.author.trim(),
    manufacturer: form.manufacturer.trim(),
    license: form.license.trim(),
    unit: form.unit.trim() || 'm',
    scale: form.scale || 1,
    visibility: form.visibility,
    category: form.category.trim() || '未分类',
    tags: [],
    ...(coverAssetId !== undefined ? { coverAssetId } : {}),
  };
}

async function uploadCover(): Promise<string | null> {
  if (!coverFile.value) return null;
  const coverTask = await store.uploadFile(coverFile.value, {
    name: `${form.name.trim()}-封面`,
    category: '资源封面',
    version: '1.0.0',
  });
  const coverAssetId = coverTask.assetId ?? null;
  if (!coverAssetId) throw new Error('封面上传完成但未返回资源编号');
  return coverAssetId;
}

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning('请输入资源名称');
    return;
  }
  if (!isEdit.value && !sourceFile.value) {
    ElMessage.warning('请先选择资源源文件');
    return;
  }
  submitting.value = true;
  try {
    const coverAssetId = await uploadCover();
    if (sourceFile.value) {
      await store.uploadFile(sourceFile.value, {
        ...metadataInput(coverAssetId ?? (isEdit.value ? undefined : null)),
        assetId: isEdit.value ? props.asset?.id : undefined,
      });
    } else if (isEdit.value && props.asset) {
      // 编辑元数据时不创建上传任务；只有选了文件才走替换解析流程。
      await store.updateAsset(props.asset.id, metadataInput(coverAssetId));
    }
    ElMessage.success(
      sourceFile.value
        ? isEdit.value
          ? '模型文件已提交替换'
          : '资源已加入解析队列'
        : '资源信息已更新',
    );
    emit('saved', Boolean(sourceFile.value || coverFile.value));
    visible.value = false;
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : '资源保存失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="isEdit ? '编辑模型与素材' : '添加模型与素材'"
    width="760px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <ElForm label-position="top" class="asset-create-form">
      <div class="asset-form-grid asset-form-grid--two">
        <ElFormItem label="资源名称" required>
          <ElInput
            v-model="form.name"
            maxlength="120"
            show-word-limit
            placeholder="例如：DEVICE-4x1 装配区"
          />
        </ElFormItem>
        <ElFormItem label="资源编码">
          <ElInput
            v-model="form.code"
            maxlength="80"
            placeholder="便于系统集成和检索"
          />
        </ElFormItem>
        <ElFormItem label="分类" required>
          <ElInput v-model="form.category" maxlength="80" />
        </ElFormItem>
        <ElFormItem label="版本">
          <ElInput
            v-model="form.version"
            maxlength="40"
            placeholder="例如：生产线A-2026"
          />
        </ElFormItem>
      </div>
      <ElFormItem label="资源描述">
        <ElInput
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
        />
      </ElFormItem>

      <ElDivider content-position="left">文件</ElDivider>
      <div class="asset-upload-fields">
        <ElFormItem
          :label="isEdit ? '源文件（可选）' : '源文件'"
          :required="!isEdit"
        >
          <ElUpload
            :auto-upload="false"
            :show-file-list="false"
            accept=".glb,.gltf,.fbx,.obj,.stl,.usdz,.hdr,.png,.jpg,.jpeg,.webp,.svg,.mp4,.webm"
            :on-change="onSourceChange"
          >
            <ElButton>{{ isEdit ? '选择新源文件' : '选择源文件' }}</ElButton>
          </ElUpload>
          <span class="asset-file-hint">{{ sourceName }}</span>
        </ElFormItem>
        <ElFormItem label="自定义封面（可选）">
          <div class="cover-upload-row">
            <ElUpload
              :auto-upload="false"
              :show-file-list="false"
              accept=".png,.jpg,.jpeg,.webp"
              :on-change="onCoverChange"
            >
              <ElButton>{{ isEdit ? '选择新封面' : '选择封面' }}</ElButton>
            </ElUpload>
            <ElTag v-if="coverFile" type="success">{{ coverName }}</ElTag>
            <span v-else class="asset-file-hint">{{ coverName }}</span>
          </div>
          <small class="asset-form-help">
            {{
              isEdit
                ? '不选择新封面则保留当前封面。'
                : '未上传封面时，系统会使用解析器生成的模型缩略图。'
            }}
          </small>
        </ElFormItem>
      </div>
    </ElForm>
    <template #footer>
      <ElButton :disabled="submitting" @click="close">取消</ElButton>
      <ElButton type="primary" :loading="submitting" @click="submit">
        {{ isEdit ? '保存修改' : '开始上传' }}
      </ElButton>
    </template>
  </ElDialog>
</template>
