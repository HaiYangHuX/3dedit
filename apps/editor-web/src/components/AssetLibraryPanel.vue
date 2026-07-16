<script setup lang="ts">
import type { Asset } from '@digital-twin/api-contracts';
import { ElInput } from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAssetStore } from '../stores/asset';

const emit = defineEmits<{ activate: [asset: Asset] }>();
const store = useAssetStore();
const { assets, loading } = storeToRefs(store);
const keyword = ref('');
const models = computed(() => {
  const normalized = keyword.value.trim().toLocaleLowerCase('zh-CN');
  return assets.value.filter(
    (asset) =>
      asset.kind === 'model' &&
      asset.status === 'ready' &&
      (!normalized ||
        asset.name.toLocaleLowerCase('zh-CN').includes(normalized) ||
        asset.tags.some((tag) =>
          tag.toLocaleLowerCase('zh-CN').includes(normalized),
        )),
  );
});

onMounted(() => {
  if (assets.value.length === 0) {
    void Promise.resolve(store.loadAssets()).catch(() => undefined);
  }
});

/** 写入平台专用 MIME，视口 drop 处理器无需解析任意外部拖放数据。 */
function beginDrag(event: DragEvent, asset: Asset): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(
    'application/x-digital-twin-asset',
    JSON.stringify({
      assetId: asset.id,
      name: asset.name,
      format: asset.format,
    }),
  );
}
</script>

<template>
  <section class="editor-asset-library">
    <div class="editor-asset-toolbar">
      <ElInput
        v-model="keyword"
        size="small"
        clearable
        placeholder="搜索模型"
      />
      <RouterLink to="/assets" target="_blank">管理</RouterLink>
    </div>
    <p v-if="loading && models.length === 0" class="empty-panel">
      正在加载模型库…
    </p>
    <p v-else-if="models.length === 0" class="empty-panel">暂无可用模型</p>
    <div v-else class="editor-asset-grid">
      <button
        v-for="asset in models"
        :key="asset.id"
        class="editor-asset-card"
        type="button"
        draggable="true"
        :data-asset-id="asset.id"
        :title="`${asset.name}（双击添加，或拖入视口）`"
        @dragstart="beginDrag($event, asset)"
        @dblclick="emit('activate', asset)"
      >
        <img
          v-if="asset.thumbnailUrl"
          :src="asset.thumbnailUrl"
          :alt="asset.name"
        />
        <span v-else class="editor-asset-placeholder">{{
          asset.format.toUpperCase()
        }}</span>
        <strong>{{ asset.name }}</strong>
      </button>
    </div>
  </section>
</template>
