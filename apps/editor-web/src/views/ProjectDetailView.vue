<script setup lang="ts">
import {
  ElAlert,
  ElButton,
  ElCard,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElSkeleton,
} from 'element-plus';
import { storeToRefs } from 'pinia';
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useProjectStore } from '../stores/project';

const props = defineProps<{ projectId: string }>();
const store = useProjectStore();
const { currentProject, loading, error } = storeToRefs(store);
const dialogVisible = ref(false);
const sceneName = ref('');
const submitting = ref(false);

async function loadProject(): Promise<void> {
  try {
    await store.openProject(props.projectId);
  } catch {
    // 展示 Store 中的统一错误文案。
  }
}

onMounted(() => void loadProject());

function openCreateDialog(): void {
  sceneName.value = '';
  dialogVisible.value = true;
}

async function createScene(): Promise<void> {
  if (!sceneName.value.trim()) {
    ElMessage.warning('请输入场景名称');
    return;
  }
  submitting.value = true;
  try {
    await store.createScene(props.projectId, sceneName.value);
    dialogVisible.value = false;
    ElMessage.success('场景已创建');
  } catch {
    ElMessage.error(store.error || '场景创建失败');
  } finally {
    submitting.value = false;
  }
}

async function copyScene(id: string): Promise<void> {
  try {
    await store.copyScene(id);
    ElMessage.success('场景已复制');
  } catch {
    ElMessage.error(store.error || '场景复制失败');
  }
}

async function deleteScene(id: string, name: string): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除场景“${name}”吗？`, '删除场景', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await store.deleteScene(id);
    ElMessage.success('场景已删除');
  } catch (reason) {
    if (reason === 'cancel' || reason === 'close') return;
    // 最后场景保护的 409 信息由 Store 原样传递给用户。
    ElMessage.error(store.error || '场景删除失败');
  }
}
</script>

<template>
  <main class="management-page">
    <header class="management-header">
      <div>
        <RouterLink to="/projects" class="back-link">← 返回项目</RouterLink>
        <h1>{{ currentProject?.name || '项目详情' }}</h1>
        <p>
          {{
            currentProject?.description || '管理当前项目的多个数字孪生场景。'
          }}
        </p>
      </div>
      <ElButton
        type="primary"
        data-testid="create-scene"
        @click="openCreateDialog"
      >
        创建场景
      </ElButton>
    </header>

    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElSkeleton v-if="loading && !currentProject" :rows="6" animated />
    <ElEmpty
      v-else-if="currentProject && currentProject.scenes.length === 0"
      description="当前项目暂无场景"
    />
    <section v-else-if="currentProject" class="card-grid" aria-label="场景列表">
      <ElCard
        v-for="scene in currentProject.scenes"
        :key="scene.id"
        class="scene-card"
      >
        <div class="scene-preview">
          <span>{{ scene.name.slice(0, 1) }}</span>
          <small>revision {{ scene.revision }}</small>
        </div>
        <div class="card-content">
          <h2>{{ scene.name }}</h2>
          <p class="scene-status">
            {{ scene.contentHash ? '已保存场景文档' : '新建空场景' }}
          </p>
          <div class="card-actions">
            <RouterLink
              :to="`/editor/${currentProject.id}/${scene.id}`"
              :data-testid="`open-scene-${scene.id}`"
            >
              <ElButton type="primary">进入编辑器</ElButton>
            </RouterLink>
            <ElButton @click="copyScene(scene.id)">复制</ElButton>
            <ElButton
              type="danger"
              plain
              @click="deleteScene(scene.id, scene.name)"
            >
              删除
            </ElButton>
          </div>
        </div>
      </ElCard>
    </section>

    <ElDialog
      v-model="dialogVisible"
      title="创建场景"
      width="420px"
      data-testid="scene-dialog"
    >
      <ElForm label-position="top" @submit.prevent="createScene">
        <ElFormItem label="场景名称" required>
          <ElInput v-model="sceneName" maxlength="80" show-word-limit />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="createScene">
          创建
        </ElButton>
      </template>
    </ElDialog>
  </main>
</template>
