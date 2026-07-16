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
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useProjectStore } from '../stores/project';

const router = useRouter();
const store = useProjectStore();
const { projects, loading, error } = storeToRefs(store);
const keyword = ref('');
const dialogVisible = ref(false);
const submitting = ref(false);
const form = reactive({ name: '', description: '' });
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function loadProjects(): Promise<void> {
  try {
    await store.loadProjects(keyword.value);
  } catch {
    // Store 已保留可展示错误，页面不重复弹出全局消息。
  }
}

watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadProjects(), 300);
});

onMounted(() => void loadProjects());
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

function openCreateDialog(): void {
  form.name = '';
  form.description = '';
  dialogVisible.value = true;
}

async function submitProject(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning('请输入项目名称');
    return;
  }
  submitting.value = true;
  try {
    const project = await store.createProject(form.name, form.description);
    dialogVisible.value = false;
    ElMessage.success('项目已创建');
    await router.push(`/projects/${project.id}`);
  } catch {
    ElMessage.error(store.error || '项目创建失败');
  } finally {
    submitting.value = false;
  }
}

async function copyProject(id: string): Promise<void> {
  try {
    const project = await store.copyProject(id);
    ElMessage.success('项目已复制');
    await router.push(`/projects/${project.id}`);
  } catch {
    ElMessage.error(store.error || '项目复制失败');
  }
}

async function deleteProject(id: string, name: string): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除项目“${name}”及其当前场景吗？`,
      '删除项目',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
    await store.deleteProject(id);
    ElMessage.success('项目已删除');
  } catch (reason) {
    if (reason === 'cancel' || reason === 'close') return;
    ElMessage.error(store.error || '项目删除失败');
  }
}
</script>

<template>
  <main class="management-page">
    <header class="management-header">
      <div>
        <p class="eyebrow">数字孪生工作台</p>
        <h1>项目管理</h1>
      </div>
      <div class="header-actions">
        <RouterLink to="/assets">模型与素材库</RouterLink>
        <ElButton
          type="primary"
          data-testid="create-project"
          @click="openCreateDialog"
        >
          创建项目
        </ElButton>
      </div>
    </header>

    <section class="management-tools">
      <ElInput
        v-model="keyword"
        clearable
        placeholder="搜索项目名称或描述"
        aria-label="搜索项目"
      />
      <span>{{ projects.length }} 个项目</span>
    </section>

    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElSkeleton v-if="loading && projects.length === 0" :rows="6" animated />
    <ElEmpty
      v-else-if="projects.length === 0"
      description="尚未创建数字孪生项目"
    />
    <section v-else class="card-grid" aria-label="项目列表">
      <ElCard
        v-for="project in projects"
        :key="project.id"
        class="project-card"
      >
        <div class="card-cover">
          <span>{{ project.name.slice(0, 1) }}</span>
        </div>
        <div class="card-content">
          <h2>{{ project.name }}</h2>
          <p>{{ project.description || '暂无项目描述' }}</p>
          <div class="card-meta">
            <span>{{ project.sceneCount }} 个场景</span>
            <span>更新于 {{ formatTime(project.updatedAt) }}</span>
          </div>
          <div class="card-actions">
            <RouterLink :to="`/projects/${project.id}`">
              <ElButton type="primary">打开项目</ElButton>
            </RouterLink>
            <ElButton @click="copyProject(project.id)">复制</ElButton>
            <ElButton
              type="danger"
              plain
              @click="deleteProject(project.id, project.name)"
            >
              删除
            </ElButton>
          </div>
        </div>
      </ElCard>
    </section>

    <ElDialog
      v-model="dialogVisible"
      title="创建数字孪生项目"
      width="480px"
      data-testid="project-dialog"
      destroy-on-close
    >
      <ElForm label-position="top" @submit.prevent="submitProject">
        <ElFormItem label="项目名称" required>
          <ElInput v-model="form.name" maxlength="80" show-word-limit />
        </ElFormItem>
        <ElFormItem label="项目描述">
          <ElInput
            v-model="form.description"
            type="textarea"
            maxlength="500"
            show-word-limit
            :rows="4"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitProject">
          创建
        </ElButton>
      </template>
    </ElDialog>
  </main>
</template>
