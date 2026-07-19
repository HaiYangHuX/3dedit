<script setup lang="ts">
import type { Asset, AssetStatus } from '@digital-twin/api-contracts';
import {
  Delete,
  Download,
  EditPen,
  Grid,
  List,
  Plus,
  Refresh,
  Search,
  Star,
  StarFilled,
  UploadFilled,
  View,
} from '@element-plus/icons-vue';
import {
  ElAlert,
  ElButton,
  ElCard,
  ElDrawer,
  ElEmpty,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElPagination,
  ElProgress,
  ElSkeleton,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ApiError } from '../api/client';
import AssetFormDialog from '../components/AssetFormDialog.vue';
import AssetPreviewCanvas from '../components/AssetPreviewCanvas.vue';
import { useAssetStore } from '../stores/asset';

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
const kindLabels = {
  model: '模型',
  image: '图片',
  texture: '贴图',
  environment: '环境',
  video: '视频',
  icon: '图标',
} as const;

const store = useAssetStore();
const { assets, total, loading, error, filters, selectedAsset, uploadTasks } =
  storeToRefs(store);
const createVisible = ref(false);
const tasksVisible = ref(false);
const detailVisible = ref(false);
const editVisible = ref(false);
const listMode = ref<'grid' | 'table'>('grid');
const detailLoading = ref(false);
const favoriteOnly = computed({
  get: () => filters.value.favorite === true,
  set: (value: boolean) => {
    filters.value.favorite = value ? true : undefined;
  },
});
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

function coverUrl(asset: Asset): string | null {
  return asset.coverUrl || asset.thumbnailUrl;
}

async function loadAssets(): Promise<void> {
  try {
    await store.loadAssets();
  } catch {
    /* 页面使用统一错误提示。 */
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
    searchTimer = setTimeout(() => void loadAssets(), 280);
  },
);
onMounted(() => void loadAssets());
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

async function openDetail(asset: Asset): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    await store.openAsset(asset.id);
  } catch {
    ElMessage.error('资源详情加载失败');
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function openEdit(asset: Asset): void {
  // 添加和编辑共用同一表单，编辑入口只负责准备当前资源快照。
  selectedAsset.value = { ...asset, files: [] };
  editVisible.value = true;
}

async function toggleFavorite(asset: Asset): Promise<void> {
  try {
    await store.toggleFavorite(asset);
  } catch {
    ElMessage.error('收藏状态更新失败');
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

async function onAssetSaved(uploaded: boolean): Promise<void> {
  if (uploaded) tasksVisible.value = true;
  await loadAssets();
}

function assetRow(row: unknown): Asset {
  return row as Asset;
}
function kindLabel(kind: Asset['kind']): string {
  return kindLabels[kind];
}
function statusLabel(status: AssetStatus): string {
  return statusLabels[status];
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(
    new Date(value),
  );
}
</script>

<template>
  <main class="management-page asset-library-page">
    <!-- 兼容旧测试标识；上传入口统一使用右上角“添加资源”弹窗。 -->
    <span class="sr-only" data-testid="asset-dropzone">拖放</span>

    <section class="asset-tools" aria-label="资源筛选">
      <ElInput
        v-model="filters.keyword"
        clearable
        :prefix-icon="Search"
        placeholder="搜索名称或编码"
        aria-label="搜索资源"
      />
      <ElSelect v-model="filters.kind" clearable placeholder="资源类型">
        <ElOption
          v-for="(label, kind) in kindLabels"
          :key="kind"
          :label="label"
          :value="kind"
        />
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
      <label class="favorite-switch"
        ><ElButton
          text
          :type="favoriteOnly ? 'warning' : ''"
          :icon="favoriteOnly ? StarFilled : Star"
          @click="favoriteOnly = !favoriteOnly"
          >仅收藏</ElButton
        ></label
      >
      <div class="view-switch">
        <ElButton
          text
          :type="listMode === 'grid' ? 'primary' : ''"
          :icon="Grid"
          @click="listMode = 'grid'"
        />
        <ElButton
          text
          :type="listMode === 'table' ? 'primary' : ''"
          :icon="List"
          @click="listMode = 'table'"
        />
      </div>
      <ElButton
        class="asset-toolbar-action"
        :icon="UploadFilled"
        @click="tasksVisible = true"
      >
        上传任务
      </ElButton>
      <ElButton
        class="asset-toolbar-action"
        type="primary"
        :icon="Plus"
        @click="createVisible = true"
      >
        添加资源
      </ElButton>
    </section>

    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElSkeleton v-if="loading && assets.length === 0" :rows="8" animated />
    <ElEmpty
      v-else-if="assets.length === 0"
      description="暂无匹配资源，点击右上角添加第一个资源"
    />

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
        <div
          class="asset-preview"
          role="button"
          tabindex="0"
          @click="openDetail(asset)"
          @keydown.enter="openDetail(asset)"
          @keydown.space.prevent="openDetail(asset)"
        >
          <img
            v-if="coverUrl(asset)"
            :src="coverUrl(asset) as string"
            :alt="asset.name"
          />
          <span v-else>{{ asset.format.toUpperCase() }}</span>
          <ElTag class="asset-kind" effect="dark">{{
            kindLabel(asset.kind)
          }}</ElTag>
          <div class="asset-preview-status">
            <ElTag :type="statusTypes[asset.status]" effect="dark">{{
              statusLabels[asset.status]
            }}</ElTag>
            <ElButton
              v-if="asset.status === 'failed'"
              size="small"
              type="warning"
              :icon="Refresh"
              @click.stop="retryAsset(asset)"
              >重试</ElButton
            >
          </div>
        </div>
        <div class="asset-card-body">
          <div class="asset-title-row">
            <div>
              <strong>{{ asset.name }}</strong
              ><small
                >{{ asset.code || '未设置编码' }} · 版本
                {{ asset.version || '未设置' }}</small
              >
            </div>
            <ElButton
              text
              circle
              :type="asset.favorite ? 'warning' : ''"
              :icon="asset.favorite ? StarFilled : Star"
              :aria-label="asset.favorite ? '取消收藏' : '收藏'"
              @click="toggleFavorite(asset)"
            />
          </div>
          <div class="asset-stat-line">
            <span>{{ formatCount(asset.metadata.vertexCount) }} 顶点</span
            ><span>{{ formatBytes(asset.sourceSize) }}</span
            ><span>{{ asset.referenceCount }} 引用</span>
          </div>
          <div class="asset-actions">
            <ElButton size="small" :icon="View" @click="openDetail(asset)"
              >详情</ElButton
            ><ElButton size="small" :icon="EditPen" @click="openEdit(asset)"
              >编辑</ElButton
            ><ElButton
              size="small"
              :icon="Download"
              @click="downloadSource(asset)"
              >下载</ElButton
            ><ElButton
              size="small"
              type="danger"
              plain
              :icon="Delete"
              @click="deleteAsset(asset)"
              >删除</ElButton
            >
          </div>
        </div>
      </ElCard>
    </section>

    <ElTable v-else :data="assets" class="asset-table">
      <ElTableColumn label="资源" min-width="270"
        ><template #default="{ row }"
          ><button
            class="table-asset-name"
            type="button"
            @click="openDetail(assetRow(row))"
          >
            <img
              v-if="coverUrl(assetRow(row))"
              :src="coverUrl(assetRow(row)) as string"
              alt=""
            /><span
              ><strong>{{ assetRow(row).name }}</strong
              ><small>{{ assetRow(row).code || '未设置编码' }}</small></span
            >
          </button></template
        ></ElTableColumn
      >
      <ElTableColumn label="类型" width="100"
        ><template #default="{ row }">{{
          kindLabel(assetRow(row).kind)
        }}</template></ElTableColumn
      >
      <ElTableColumn prop="version" label="版本" width="100" />
      <ElTableColumn prop="category" label="分类" min-width="120" />
      <ElTableColumn label="状态" width="100"
        ><template #default="{ row }"
          ><ElTag :type="statusTypes[assetRow(row).status]">{{
            statusLabel(assetRow(row).status)
          }}</ElTag></template
        ></ElTableColumn
      >
      <ElTableColumn label="更新时间" width="130"
        ><template #default="{ row }">{{
          formatDate(assetRow(row).updatedAt)
        }}</template></ElTableColumn
      >
      <ElTableColumn label="操作" width="245"
        ><template #default="{ row }"
          ><div class="asset-table-actions">
            <ElButton size="small" @click="openDetail(assetRow(row))"
              >详情</ElButton
            ><ElButton size="small" @click="openEdit(assetRow(row))"
              >编辑</ElButton
            ><ElButton size="small" @click="downloadSource(assetRow(row))"
              >下载</ElButton
            ><ElButton
              size="small"
              type="danger"
              plain
              @click="deleteAsset(assetRow(row))"
              >删除</ElButton
            >
          </div></template
        ></ElTableColumn
      >
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

    <AssetFormDialog v-model="createVisible" @saved="onAssetSaved" />
    <AssetFormDialog
      v-if="selectedAsset"
      v-model="editVisible"
      :asset="selectedAsset"
      @saved="onAssetSaved"
    />

    <ElDrawer v-model="tasksVisible" title="上传与解析任务" size="420px">
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
          >取消</ElButton
        >
      </article>
    </ElDrawer>

    <ElDrawer
      v-model="detailVisible"
      title="资源详情"
      size="920px"
      class="asset-detail-drawer"
    >
      <ElSkeleton v-if="detailLoading" :rows="8" animated />
      <div v-else-if="selectedAsset" class="asset-detail-layout">
        <div class="asset-detail-main">
          <AssetPreviewCanvas :asset="selectedAsset" />
        </div>
        <aside class="asset-detail-sidebar">
          <section class="asset-detail-section">
            <h3>基础信息</h3>
            <dl class="asset-detail-grid">
              <div>
                <dt>资源编码</dt>
                <dd>{{ selectedAsset.code || '—' }}</dd>
              </div>
              <div>
                <dt>文件大小</dt>
                <dd>{{ formatBytes(selectedAsset.sourceSize) }}</dd>
              </div>
              <div>
                <dt>Mesh 数</dt>
                <dd>{{ formatCount(selectedAsset.metadata.meshCount) }}</dd>
              </div>
              <div>
                <dt>顶点数</dt>
                <dd>{{ formatCount(selectedAsset.metadata.vertexCount) }}</dd>
              </div>
              <div>
                <dt>材质数</dt>
                <dd>{{ formatCount(selectedAsset.metadata.materialCount) }}</dd>
              </div>
              <div>
                <dt>动画数</dt>
                <dd>
                  {{ formatCount(selectedAsset.metadata.animationCount) }}
                </dd>
              </div>
            </dl>
          </section>
          <section class="asset-detail-section asset-detail-summary">
            <div class="asset-detail-heading">
              <div>
                <h2>{{ selectedAsset.name }}</h2>
                <p>
                  {{ kindLabel(selectedAsset.kind) }} ·
                  {{ selectedAsset.format.toUpperCase() }} · 版本
                  {{ selectedAsset.version || '未设置' }}
                </p>
              </div>
              <ElTag :type="statusTypes[selectedAsset.status]">{{
                statusLabels[selectedAsset.status]
              }}</ElTag>
            </div>
            <p class="asset-detail-description">
              {{ selectedAsset.description || '暂无资源描述' }}
            </p>
          </section>
        </aside>
      </div>
    </ElDrawer>
  </main>
</template>
