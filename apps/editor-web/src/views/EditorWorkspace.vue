<script setup lang="ts">
import type { Asset } from '@digital-twin/api-contracts';
import { ElButton, ElButtonGroup, ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, watch } from 'vue';
import EditorCanvas from '../components/EditorCanvas.vue';
import AssetLibraryPanel from '../components/AssetLibraryPanel.vue';
import { useDocumentStore, type SaveState } from '../stores/document';

const props = withDefaults(
  defineProps<{ projectId?: string; sceneId?: string }>(),
  { projectId: 'local-project', sceneId: 'local-scene' },
);
const store = useDocumentStore();
const { document, saveState, error } = storeToRefs(store);

const saveStateLabel: Record<SaveState, string> = {
  idle: '尚未加载',
  loading: '加载中',
  saved: '已保存',
  dirty: '有未保存更改',
  saving: '保存中',
  conflict: '保存冲突',
  error: '保存失败',
};
const stateLabel = computed(() => saveStateLabel[saveState.value]);

watch(
  () => props.sceneId,
  (sceneId) => {
    void Promise.resolve(store.loadScene(sceneId)).catch(() => {
      // 状态栏展示详细错误，保留引擎视口以便用户重试。
    });
  },
  { immediate: true },
);

onBeforeUnmount(() => store.disposeAutoSave());

async function saveDocument(): Promise<void> {
  try {
    await store.save();
    ElMessage.success('场景已保存');
  } catch {
    ElMessage.error(error.value || '场景保存失败');
  }
}

function reloadScene(): void {
  void store.loadScene(props.sceneId).catch(() => undefined);
}

function activateAsset(asset: Asset): void {
  // 资源列表与拖放协议已接通；模型实例化将在 Loader/命令系统阶段统一落入撤销历史。
  ElMessage.info(`已选择模型“${asset.name}”，可拖放到视口中`);
}
</script>

<template>
  <main class="editor-workspace">
    <header class="top-toolbar" data-testid="top-toolbar">
      <div class="brand-block">
        <span class="brand-dot" />
        <strong>数字孪生场景平台</strong>
        <span class="scene-name">{{ document.name }}</span>
      </div>
      <ElButtonGroup>
        <ElButton size="small">撤销</ElButton>
        <ElButton size="small">重做</ElButton>
        <ElButton
          size="small"
          :loading="saveState === 'saving'"
          :disabled="saveState === 'loading'"
          data-testid="save-scene"
          @click="saveDocument"
        >
          保存
        </ElButton>
        <ElButton
          v-if="saveState === 'conflict'"
          size="small"
          @click="reloadScene"
        >
          重新加载
        </ElButton>
        <ElButton size="small">预览</ElButton>
        <ElButton type="primary" size="small">发布</ElButton>
      </ElButtonGroup>
    </header>

    <aside class="asset-panel" data-testid="asset-panel">
      <h2>场景元素</h2>
      <nav class="asset-categories">
        <button type="button" class="active">模型</button>
        <button type="button">几何体</button>
        <button type="button">灯光</button>
        <button type="button">图表</button>
        <button type="button">文本</button>
        <button type="button">视频</button>
        <button type="button">Shader</button>
      </nav>
      <AssetLibraryPanel @activate="activateAsset" />
    </aside>

    <section class="viewport-shell">
      <div class="viewport-tools">移动 · 旋转 · 缩放 · 聚焦</div>
      <EditorCanvas :document="document" />
    </section>

    <aside class="inspector-panel" data-testid="inspector-panel">
      <nav class="inspector-tabs">
        <button type="button" class="active">场景内容</button>
        <button type="button">交互事件</button>
        <button type="button">Socket 任务</button>
        <button type="button">项目配置</button>
      </nav>
      <div class="empty-panel">当前场景暂无节点</div>
    </aside>

    <footer class="status-bar" data-testid="status-bar">
      <span>对象 {{ Object.keys(document.nodes).length }}</span>
      <span>顶点 0</span><span>面 0</span><span>FPS --</span>
      <span
        class="save-state"
        :class="{
          'save-state--error':
            saveState === 'conflict' || saveState === 'error',
        }"
        :title="error"
      >
        {{ stateLabel }}
      </span>
    </footer>
  </main>
</template>
