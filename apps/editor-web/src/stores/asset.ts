import type {
  Asset,
  AssetDetail,
  AssetKind,
  AssetStatus,
  UpdateAssetInput,
} from '@digital-twin/api-contracts';
import { defineStore } from 'pinia';
import { reactive, ref, shallowRef } from 'vue';
import { assetApi } from '../api/assets';
import { ApiError } from '../api/client';
import { hashFile } from '../uploads/hashFile';
import { uploadMultipart } from '../uploads/multipartUpload';

export interface AssetFilters {
  keyword: string;
  kind?: AssetKind;
  category: string;
  status?: AssetStatus;
  favorite?: boolean;
  page: number;
  pageSize: number;
}

export type UploadTaskStatus =
  'hashing' | 'uploading' | 'processing' | 'ready' | 'failed' | 'cancelled';

export interface UploadTask {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  status: UploadTaskStatus;
  error: string;
  uploadId?: string;
  assetId?: string;
  createdAt: string;
}

export interface UploadFileOptions {
  category?: string;
  tags?: string[];
  assetId?: string;
  pollInterval?: number;
}

let taskSequence = 0;

function nextTaskId(): string {
  taskSequence += 1;
  return `upload-${Date.now()}-${taskSequence}`;
}

function summaryOf(detail: AssetDetail): Asset {
  const { files, ...summary } = detail;
  void files;
  return summary;
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** 模型库状态只保存可序列化 DTO；File 与 AbortController 均限制在 action 生命周期。 */
export const useAssetStore = defineStore('asset', () => {
  // Asset.metadata 允许递归 JSON；服务端 DTO 无需深层响应式，避免 Vue 类型无限展开。
  const assets = shallowRef<Asset[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref('');
  const selectedAsset = shallowRef<AssetDetail | null>(null);
  const uploadTasks = ref<UploadTask[]>([]);
  const filters = reactive<AssetFilters>({
    keyword: '',
    category: '',
    page: 1,
    pageSize: 24,
  });
  const controllers = new Map<string, AbortController>();

  async function loadAssets(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const response = await assetApi.list({
        page: filters.page,
        pageSize: filters.pageSize,
        keyword: filters.keyword,
        kind: filters.kind,
        category: filters.category || undefined,
        status: filters.status,
        favorite: filters.favorite,
      });
      assets.value = response.items;
      total.value = response.total;
    } catch (reason) {
      error.value =
        reason instanceof ApiError ? reason.message : '资源列表加载失败';
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  async function openAsset(id: string): Promise<AssetDetail> {
    const detail = await assetApi.get(id);
    selectedAsset.value = detail;
    return detail;
  }

  function upsertAsset(asset: Asset): void {
    const index = assets.value.findIndex(({ id }) => id === asset.id);
    if (index === -1) {
      assets.value = [asset, ...assets.value];
      return;
    }
    // shallowRef 只跟踪数组引用，服务端 DTO 更新必须使用不可变替换才能刷新页面。
    assets.value = assets.value.map((current) =>
      current.id === asset.id ? asset : current,
    );
  }

  async function updateAsset(
    id: string,
    input: UpdateAssetInput,
  ): Promise<AssetDetail> {
    const detail = await assetApi.update(id, input);
    upsertAsset(summaryOf(detail));
    selectedAsset.value = detail;
    return detail;
  }

  async function toggleFavorite(asset: Asset): Promise<void> {
    await updateAsset(asset.id, { favorite: !asset.favorite });
  }

  async function removeAsset(id: string): Promise<void> {
    await assetApi.remove(id);
    assets.value = assets.value.filter((asset) => asset.id !== id);
    total.value = Math.max(0, total.value - 1);
    if (selectedAsset.value?.id === id) selectedAsset.value = null;
  }

  async function pollUntilSettled(
    assetId: string,
    interval: number,
    signal: AbortSignal,
  ): Promise<AssetDetail> {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const detail = await assetApi.get(assetId);
      if (detail.status === 'ready') return detail;
      if (detail.status === 'failed') {
        throw new Error(detail.error || '资源解析失败');
      }
      await wait(interval, signal);
    }
    throw new Error('资源解析等待超时');
  }

  async function uploadFile(
    file: File,
    options: UploadFileOptions = {},
  ): Promise<UploadTask> {
    const task = reactive<UploadTask>({
      id: nextTaskId(),
      fileName: file.name,
      size: file.size,
      progress: 0,
      status: 'hashing',
      error: '',
      createdAt: new Date().toISOString(),
    });
    uploadTasks.value.unshift(task);
    const controller = new AbortController();
    controllers.set(task.id, controller);
    try {
      const sha256 = await hashFile(file, {
        signal: controller.signal,
        // 哈希阶段占总进度前 10%，避免大文件计算期间界面看似卡死。
        onProgress: (percent) => {
          task.progress = Math.round(percent * 0.1);
        },
      });
      const session = await assetApi.createUpload({
        fileName: file.name,
        size: file.size,
        sha256,
        mimeType: file.type || 'application/octet-stream',
        category: options.category,
        tags: options.tags,
        assetId: options.assetId,
      });
      task.uploadId = session.id;
      task.assetId = session.assetId;
      task.status = 'uploading';
      const parts = await uploadMultipart(file, session, {
        concurrency: 3,
        signal: controller.signal,
        onProgress: ({ percent }) => {
          task.progress = 10 + Math.round(percent * 0.85);
        },
      });
      await assetApi.completeUpload(session.id, { parts });
      task.status = 'processing';
      task.progress = 96;
      const detail = await pollUntilSettled(
        session.assetId,
        options.pollInterval ?? 1_200,
        controller.signal,
      );
      task.status = 'ready';
      task.progress = 100;
      upsertAsset(summaryOf(detail));
      selectedAsset.value = detail;
      return task;
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        task.status = 'cancelled';
        task.error = '上传已取消';
      } else {
        task.status = 'failed';
        task.error = reason instanceof Error ? reason.message : '资源上传失败';
      }
      if (task.uploadId && task.status === 'cancelled') {
        await assetApi.cancelUpload(task.uploadId).catch(() => undefined);
      }
      throw reason;
    } finally {
      controllers.delete(task.id);
    }
  }

  function cancelUploadTask(taskId: string): void {
    controllers.get(taskId)?.abort();
  }

  async function retryAsset(id: string): Promise<void> {
    await assetApi.retry(id);
    const index = assets.value.findIndex((asset) => asset.id === id);
    if (index >= 0 && assets.value[index]) {
      assets.value = assets.value.map((asset) =>
        asset.id === id ? { ...asset, status: 'queued', error: null } : asset,
      );
    }
  }

  return {
    assets,
    total,
    loading,
    error,
    filters,
    selectedAsset,
    uploadTasks,
    loadAssets,
    openAsset,
    updateAsset,
    toggleFavorite,
    removeAsset,
    uploadFile,
    cancelUploadTask,
    retryAsset,
  };
});
