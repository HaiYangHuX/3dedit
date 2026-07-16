<script setup lang="ts">
import type { Asset, AssetStatus } from '@digital-twin/api-contracts';
import {
  ElAlert,
  ElButton,
  ElCard,
  ElDialog,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElProgress,
  ElSelect,
  ElSkeleton,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { storeToRefs } from 'pinia';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { RouterLink } from 'vue-router';
import { ApiError } from '../api/client';
import { useAssetStore } from '../stores/asset';

const ACCEPTED_FORMATS =
  '.glb,.gltf,.fbx,.obj,.stl,.usdz,.hdr,.png,.jpg,.jpeg,.webp,.svg,.mp4,.webm';
const statusLabels: Record<AssetStatus, string> = {
  uploading: '上传中',
  queued: '排队中',
  processing: '解析中',
  ready: '可用',
  failed: '失败',
};
const statusTypes: Record<
  AssetStatus,
  'info' | 'warning' | 'success' | 'danger'
> = {
  uploading: 'info',
  queued: 'warning',
  processing: 'warning',
  ready: 'success',
  failed: 'danger',
};

const store = useAssetStore();
const { assets, total, loading, error, filters, selectedAsset, uploadTasks } =
  storeToRefs(store);
const fileInput = ref<HTMLInputElement>();
const tasksVisible = ref(false);
const detailVisible = ref(false);
const editVisible = ref(false);
const listMode = ref<'grid' | 'table'>('grid');
const favoriteOnly = computed({
  get: () => filters.value.favorite === true,
  set: (value: boolean) => {
    filters.value.favorite = value ? true : undefined;
  },
});
const editForm = reactive({ name: '', category: '', tags: '' });
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatCount(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '0';
}

/** Element Plus 表格 slot 使用 DefaultRow，这里在单一边界恢复模型库 DTO 类型。 */
function assetRow(row: unknown): Asset {
  return row as Asset;
}

function statusLabel(row: unknown): string {
  return statusLabels[assetRow(row).status];
}

async function loadAssets(): Promise<void> {
  try {
    await store.loadAssets();
  } catch {
    // Store 已保存详细错误，列表区域使用 ElAlert 展示即可。
  }
}

watch(
  () => [
    filters.value.keyword,
    filters.value.kind,
    filters.value.category,
    filters.value.status,
    filters.value.favorite,
  ],
  () => {
    filters.value.page = 1;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadAssets(), 300);
  },
);

onMounted(() => void loadAssets());
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

function chooseFiles(): void {
  fileInput.value?.click();
}

async function uploadFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;
  tasksVisible.value = true;
  const outcomes = await Promise.allSettled(
    files.map((file) => store.uploadFile(file)),
  );
  const completed = outcomes.filter(
    (outcome) => outcome.status === 'fulfilled',
  ).length;
  if (completed > 0) ElMessage.success(`${completed} 个资源已解析完成`);
  if (completed < outcomes.length) ElMessage.warning('部分资源上传或解析失败');
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  void uploadFiles(Array.from(input.files ?? []));
  input.value = '';
}

function onDrop(event: DragEvent): void {
  void uploadFiles(Array.from(event.dataTransfer?.files ?? []));
}

async function openDetail(asset: Asset): Promise<void> {
  detailVisible.value = true;
  try {
    await store.openAsset(asset.id);
  } catch {
    ElMessage.error('资源详情加载失败');
    detailVisible.value = false;
  }
}

async function toggleFavorite(asset: Asset): Promise<void> {
  try {
    await store.toggleFavorite(asset);
  } catch {
    ElMessage.error('收藏状态更新失败');
  }
}

function openEdit(asset: Asset): void {
  editForm.name = asset.name;
  editForm.category = asset.category;
  editForm.tags = asset.tags.join(', ');
  selectedAsset.value = { ...asset, files: [] };
  editVisible.value = true;
}

async function saveEdit(): Promise<void> {
  if (!selectedAsset.value || !editForm.name.trim()) return;
  try {
    await store.updateAsset(selectedAsset.value.id, {
      name: editForm.name,
      category: editForm.category || '未分类',
      tags: editForm.tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    editVisible.value = false;
    ElMessage.success('资源信息已更新');
  } catch {
    ElMessage.error('资源信息更新失败');
  }
}

async function retryAsset(asset: Asset): Promise<void> {
  try {
    await store.retryAsset(asset.id);
    ElMessage.success('已重新加入解析队列');
  } catch {
    ElMessage.error('资源重试失败');
  }
}

async function deleteAsset(asset: Asset): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除资源“${asset.name}”及其源文件吗？`,
      '删除资源',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
    await store.removeAsset(asset.id);
    ElMessage.success('资源已删除');
  } catch (reason) {
    if (reason === 'cancel' || reason === 'close') return;
    if (reason instanceof ApiError && reason.code === 'ASSET_IN_USE') {
      ElMessage.warning(reason.message);
      return;
    }
    ElMessage.error('资源删除失败');
  }
}

async function downloadSource(asset: Asset): Promise<void> {
  try {
    const detail = await store.openAsset(asset.id);
    const source = detail.files.find(
      (file) => file.role === 'source' && file.downloadUrl,
    );
    if (!source?.downloadUrl) throw new Error('源文件下载地址不存在');
    window.open(source.downloadUrl, '_blank', 'noopener,noreferrer');
  } catch {
    ElMessage.error('源文件下载失败');
  }
}
</script>

<template>
  <main class="management-page asset-library-page">
    <header class="management-header">
      <div>
        <p class="eyebrow">自有资源中心</p>
        <h1>模型与素材库</h1>
        <p>集中管理模型、环境、贴图、图片、图标与视频，并自动校验和解析。</p>
      </div>
      <div class="header-actions">
        <RouterLink to="/projects">返回项目</RouterLink>
        <ElButton @click="tasksVisible = true">
          上传任务 {{ uploadTasks.length ? `(${uploadTasks.length})` : '' }}
        </ElButton>
        <ElButton type="primary" @click="chooseFiles">上传资源</ElButton>
        <input
          ref="fileInput"
          hidden
          multiple
          type="file"
          :accept="ACCEPTED_FORMATS"
          @change="onFileChange"
        />
      </div>
    </header>

    <section
      class="asset-dropzone"
      data-testid="asset-dropzone"
      @click="chooseFiles"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <strong>拖放模型或素材到这里</strong>
      <span>GLB / GLTF / FBX / OBJ / STL / USDZ · HDR / 图片 / 视频</span>
      <small>大文件会计算 SHA-256 后以 5 MiB 分片直传对象存储</small>
    </section>

    <section class="asset-tools" aria-label="资源筛选">
      <ElInput
        v-model="filters.keyword"
        clearable
        placeholder="搜索名称或标签"
        aria-label="搜索资源"
      />
      <ElSelect v-model="filters.kind" clearable placeholder="资源类型">
        <ElOption label="模型" value="model" />
        <ElOption label="图片" value="image" />
        <ElOption label="贴图" value="texture" />
        <ElOption label="环境" value="environment" />
        <ElOption label="视频" value="video" />
        <ElOption label="图标" value="icon" />
      </ElSelect>
      <ElInput v-model="filters.category" clearable placeholder="分类" />
      <ElSelect v-model="filters.status" clearable placeholder="处理状态">
        <ElOption
          v-for="(label, status) in statusLabels"
          :key="status"
          :label="label"
          :value="status"
        />
      </ElSelect>
      <label class="favorite-switch">
        <ElSwitch v-model="favoriteOnly" /> 仅收藏
      </label>
      <div class="view-switch">
        <ElButton
          :type="listMode === 'grid' ? 'primary' : ''"
          @click="listMode = 'grid'"
        >
          卡片
        </ElButton>
        <ElButton
          :type="listMode === 'table' ? 'primary' : ''"
          @click="listMode = 'table'"
        >
          表格
        </ElButton>
      </div>
    </section>

    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElSkeleton v-if="loading && assets.length === 0" :rows="8" animated />
    <ElEmpty v-else-if="assets.length === 0" description="模型库暂无匹配资源" />

    <section
      v-else-if="listMode === 'grid'"
      class="asset-grid"
      aria-label="资源列表"
    >
      <ElCard
        v-for="asset in assets"
        :key="asset.id"
        class="asset-card"
        shadow="hover"
      >
        <button class="asset-preview" type="button" @click="openDetail(asset)">
          <img
            v-if="asset.thumbnailUrl"
            :src="asset.thumbnailUrl"
            :alt="asset.name"
          />
          <span v-else>{{ asset.format.toUpperCase() }}</span>
          <ElTag
            class="asset-status"
            :type="statusTypes[asset.status]"
            effect="dark"
          >
            {{ statusLabels[asset.status] }}
          </ElTag>
        </button>
        <div class="asset-card-body">
          <div class="asset-title-row">
            <div>
              <strong>{{ asset.name }}</strong>
              <small
                >{{ asset.category }} ·
                {{ formatBytes(asset.sourceSize) }}</small
              >
            </div>
            <button
              class="favorite-button"
              type="button"
              :aria-label="asset.favorite ? '取消收藏' : '收藏'"
              @click="toggleFavorite(asset)"
            >
              {{ asset.favorite ? '★' : '☆' }}
            </button>
          </div>
          <div class="asset-stat-line">
            <span>{{ formatCount(asset.metadata.vertexCount) }} 顶点</span>
            <span>{{ formatCount(asset.metadata.faceCount) }} 面</span>
            <span>{{ asset.referenceCount }} 引用</span>
          </div>
          <div class="asset-tags">
            <ElTag
              v-for="tag in asset.tags.slice(0, 3)"
              :key="tag"
              size="small"
            >
              {{ tag }}
            </ElTag>
          </div>
          <div class="asset-actions">
            <ElButton size="small" @click="openDetail(asset)">详情</ElButton>
            <ElButton size="small" @click="openEdit(asset)">编辑</ElButton>
            <ElButton size="small" @click="downloadSource(asset)"
              >下载</ElButton
            >
            <ElButton
              v-if="asset.status === 'failed'"
              size="small"
              type="warning"
              @click="retryAsset(asset)"
            >
              重试
            </ElButton>
            <ElButton
              size="small"
              type="danger"
              plain
              @click="deleteAsset(asset)"
            >
              删除
            </ElButton>
          </div>
        </div>
      </ElCard>
    </section>

    <ElTable v-else :data="assets" class="asset-table">
      <ElTableColumn label="资源" min-width="240">
        <template #default="{ row }">
          <button
            class="table-asset-name"
            type="button"
            @click="openDetail(assetRow(row))"
          >
            <img v-if="row.thumbnailUrl" :src="row.thumbnailUrl" alt="" />
            <span>{{ row.name }}</span>
          </button>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="format" label="格式" width="90" />
      <ElTableColumn prop="category" label="分类" width="140" />
      <ElTableColumn label="状态" width="110">
        <template #default="{ row }">{{ statusLabel(row) }}</template>
      </ElTableColumn>
      <ElTableColumn label="大小" width="110">
        <template #default="{ row }">{{
          formatBytes(row.sourceSize)
        }}</template>
      </ElTableColumn>
      <ElTableColumn label="引用" width="80" prop="referenceCount" />
      <ElTableColumn label="操作" min-width="260">
        <template #default="{ row }">
          <ElButton size="small" @click="openDetail(assetRow(row))"
            >详情</ElButton
          >
          <ElButton size="small" @click="toggleFavorite(assetRow(row))"
            >收藏</ElButton
          >
          <ElButton
            size="small"
            type="danger"
            plain
            @click="deleteAsset(assetRow(row))"
          >
            删除
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>

    <ElPagination
      v-if="total > filters.pageSize"
      v-model:current-page="filters.page"
      v-model:page-size="filters.pageSize"
      class="asset-pagination"
      layout="total, sizes, prev, pager, next"
      :total="total"
      :page-sizes="[12, 24, 48, 96]"
      @change="loadAssets"
    />

    <ElDrawer v-model="tasksVisible" title="上传与解析任务" size="440px">
      <ElEmpty v-if="uploadTasks.length === 0" description="暂无上传任务" />
      <article v-for="task in uploadTasks" :key="task.id" class="upload-task">
        <div>
          <strong>{{ task.fileName }}</strong
          ><span>{{ formatBytes(task.size) }}</span>
        </div>
        <ElProgress
          :percentage="task.progress"
          :status="task.status === 'failed' ? 'exception' : undefined"
        />
        <p>{{ task.error || task.status }}</p>
        <ElButton
          v-if="task.status === 'hashing' || task.status === 'uploading'"
          size="small"
          @click="store.cancelUploadTask(task.id)"
        >
          取消
        </ElButton>
      </article>
    </ElDrawer>

    <ElDrawer v-model="detailVisible" title="资源详情" size="520px">
      <template v-if="selectedAsset">
        <img
          v-if="selectedAsset.thumbnailUrl"
          class="asset-detail-preview"
          :src="selectedAsset.thumbnailUrl"
          :alt="selectedAsset.name"
        />
        <h2>{{ selectedAsset.name }}</h2>
        <p>
          {{ selectedAsset.format.toUpperCase() }} ·
          {{ selectedAsset.category }}
        </p>
        <dl class="asset-detail-grid">
          <div>
            <dt>顶点</dt>
            <dd>{{ formatCount(selectedAsset.metadata.vertexCount) }}</dd>
          </div>
          <div>
            <dt>面</dt>
            <dd>{{ formatCount(selectedAsset.metadata.faceCount) }}</dd>
          </div>
          <div>
            <dt>Mesh</dt>
            <dd>{{ formatCount(selectedAsset.metadata.meshCount) }}</dd>
          </div>
          <div>
            <dt>材质</dt>
            <dd>{{ formatCount(selectedAsset.metadata.materialCount) }}</dd>
          </div>
          <div>
            <dt>动画</dt>
            <dd>{{ formatCount(selectedAsset.metadata.animationCount) }}</dd>
          </div>
          <div>
            <dt>场景引用</dt>
            <dd>{{ selectedAsset.referenceCount }}</dd>
          </div>
        </dl>
        <ElAlert
          v-if="selectedAsset.error"
          :title="selectedAsset.error"
          type="error"
          :closable="false"
        />
      </template>
    </ElDrawer>

    <ElDialog v-model="editVisible" title="编辑资源信息" width="480px">
      <ElForm label-position="top">
        <ElFormItem label="名称" required
          ><ElInput v-model="editForm.name"
        /></ElFormItem>
        <ElFormItem label="分类"
          ><ElInput v-model="editForm.category"
        /></ElFormItem>
        <ElFormItem label="标签"
          ><ElInput v-model="editForm.tags" placeholder="使用逗号分隔"
        /></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" @click="saveEdit">保存</ElButton>
      </template>
    </ElDialog>
  </main>
</template>
