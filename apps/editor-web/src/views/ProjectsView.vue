<script setup lang="ts">
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from '@digital-twin/api-contracts';
import {
  Edit,
  FolderOpened,
  Plus,
  Refresh,
  Search,
  View,
} from '@element-plus/icons-vue';
import {
  ElAlert,
  ElButton,
  ElCard,
  ElEmpty,
  ElIcon,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElSkeleton,
} from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import ProjectFormDialog from '../components/ProjectFormDialog.vue';
import { useProjectStore } from '../stores/project';

const router = useRouter();
const store = useProjectStore();
const { projects, loading, error } = storeToRefs(store);
const keyword = ref('');
const dialogVisible = ref(false);
const editVisible = ref(false);
const submitting = ref(false);
const editingProjectId = ref<string | null>(null);
const formProject = computed(
  () =>
    projects.value.find((project) => project.id === editingProjectId.value) ??
    null,
);
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
  searchTimer = setTimeout(() => void loadProjects(), 280);
});

onMounted(() => void loadProjects());
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

function openCreateDialog(): void {
  dialogVisible.value = true;
}

function openEditDialog(id: string): void {
  editingProjectId.value = id;
  editVisible.value = true;
}

async function submitProject(
  input: CreateProjectInput | UpdateProjectInput,
): Promise<void> {
  if (!input.name) {
    ElMessage.warning('请输入项目名称');
    return;
  }
  submitting.value = true;
  try {
    // 创建表单的 name/description 为必填，联合事件类型在这里收窄后再提交。
    const project = await store.createProject(input as CreateProjectInput);
    dialogVisible.value = false;
    ElMessage.success('项目已创建');
    await router.push(`/projects/${project.id}`);
  } catch {
    ElMessage.error(store.error || '项目创建失败');
  } finally {
    submitting.value = false;
  }
}

async function updateProject(
  input: CreateProjectInput | UpdateProjectInput,
): Promise<void> {
  if (!editingProjectId.value) return;
  submitting.value = true;
  try {
    await store.updateProject(editingProjectId.value, input);
    editVisible.value = false;
    ElMessage.success('项目资料已更新');
  } catch {
    ElMessage.error(store.error || '项目更新失败');
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
  <div class="management-page projects-page">
    <section class="management-toolbar">
      <ElInput
        v-model="keyword"
        clearable
        class="management-search"
        placeholder="搜索项目名称或编码"
        aria-label="搜索项目"
      >
        <template #prefix
          ><ElIcon><Search /></ElIcon
        ></template>
      </ElInput>
      <span class="management-toolbar__count"
        >共 {{ projects.length }} 个项目</span
      >
      <ElButton text :loading="loading" @click="loadProjects"
        ><ElIcon><Refresh /></ElIcon> 刷新</ElButton
      >
      <ElButton
        type="primary"
        data-testid="create-project"
        @click="openCreateDialog"
      >
        <ElIcon><Plus /></ElIcon> 创建项目
      </ElButton>
    </section>

    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      class="management-alert"
    />
    <ElSkeleton v-if="loading && projects.length === 0" :rows="6" animated />
    <ElEmpty
      v-else-if="projects.length === 0"
      description="尚未创建数字孪生项目"
    >
      <ElButton type="primary" @click="openCreateDialog"
        >创建第一个项目</ElButton
      >
    </ElEmpty>
    <section v-else class="project-card-grid" aria-label="项目列表">
      <ElCard
        v-for="project in projects"
        :key="project.id"
        class="project-card product-card"
        shadow="hover"
      >
        <RouterLink :to="`/projects/${project.id}`" class="project-card__cover">
          <img
            v-if="project.coverKey?.startsWith('http')"
            :src="project.coverKey"
            :alt="project.name"
          />
          <span v-else class="project-card__cover-fallback">{{
            project.name.slice(0, 1)
          }}</span>
        </RouterLink>
        <div class="project-card__body">
          <div class="project-card__title-row">
            <div class="project-card__title-wrap">
              <RouterLink :to="`/projects/${project.id}`"
                ><h2>{{ project.name }}</h2></RouterLink
              >
              <span>{{ project.code || '未设置项目编码' }}</span>
            </div>
            <ElButton
              text
              circle
              title="编辑项目资料"
              @click="openEditDialog(project.id)"
              ><ElIcon><Edit /></ElIcon
            ></ElButton>
          </div>
          <div class="project-card__meta">
            <span
              ><ElIcon><FolderOpened /></ElIcon>
              {{ project.sceneCount ?? 0 }} 个场景</span
            ><span
              ><ElIcon><View /></ElIcon>
              {{ project.assetCount ?? 0 }} 个资源</span
            >
          </div>
          <div class="project-card__footer">
            <span>更新于 {{ formatTime(project.updatedAt) }}</span>
            <div class="project-card__actions">
              <RouterLink :to="`/projects/${project.id}`"
                ><ElButton type="primary" size="small"
                  >打开项目</ElButton
                ></RouterLink
              ><ElButton size="small" @click="copyProject(project.id)"
                >复制</ElButton
              ><ElButton
                size="small"
                type="danger"
                plain
                @click="deleteProject(project.id, project.name)"
                >删除</ElButton
              >
            </div>
          </div>
        </div>
      </ElCard>
    </section>

    <ProjectFormDialog
      v-model="dialogVisible"
      :submitting="submitting"
      @submit="submitProject"
    />
    <ProjectFormDialog
      v-model="editVisible"
      mode="edit"
      :project="formProject"
      :submitting="submitting"
      test-id="project-edit-dialog"
      @submit="updateProject"
    />
  </div>
</template>
