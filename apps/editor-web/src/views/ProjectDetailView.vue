<script setup lang="ts">
import type {
  CreateSceneInput,
  CreateProjectInput,
  UpdateSceneInput,
  UpdateProjectInput,
} from '@digital-twin/api-contracts';
import {
  Calendar,
  CopyDocument,
  Delete,
  Edit,
  Plus,
  Setting,
  VideoPlay,
} from '@element-plus/icons-vue';
import {
  ElAlert,
  ElButton,
  ElCard,
  ElEmpty,
  ElIcon,
  ElMessage,
  ElMessageBox,
  ElSkeleton,
  ElTag,
} from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import ProjectFormDialog from '../components/ProjectFormDialog.vue';
import SceneFormDialog from '../components/SceneFormDialog.vue';
import { useProjectStore } from '../stores/project';

const props = defineProps<{ projectId: string }>();
const store = useProjectStore();
const { currentProject, loading, error } = storeToRefs(store);
const sceneFormVisible = ref(false);
const sceneFormMode = ref<'create' | 'edit'>('create');
const editDialogVisible = ref(false);
const editingSceneId = ref<string | null>(null);
const submitting = ref(false);
const editingScene = computed(
  () =>
    currentProject.value?.scenes.find(
      (scene) => scene.id === editingSceneId.value,
    ) ?? null,
);
function formatTime(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function loadProject(): Promise<void> {
  try {
    await store.openProject(props.projectId);
  } catch {
    // 页面使用 Store 统一错误状态，不重复弹出相同提示。
  }
}

onMounted(() => void loadProject());
watch(
  () => props.projectId,
  () => void loadProject(),
);

function openCreateDialog(): void {
  editingSceneId.value = null;
  sceneFormMode.value = 'create';
  sceneFormVisible.value = true;
}

function openEditSceneDialog(scene: { id: string; name: string }): void {
  editingSceneId.value = scene.id;
  sceneFormMode.value = 'edit';
  sceneFormVisible.value = true;
}

function openEditDialog(): void {
  editDialogVisible.value = true;
}

async function updateProject(
  input: CreateProjectInput | UpdateProjectInput,
): Promise<void> {
  if (!currentProject.value) return;
  submitting.value = true;
  try {
    await store.updateProject(currentProject.value.id, input);
    editDialogVisible.value = false;
    ElMessage.success('项目资料已更新');
  } catch {
    ElMessage.error(store.error || '项目更新失败');
  } finally {
    submitting.value = false;
  }
}

async function submitScene(
  input: CreateSceneInput | UpdateSceneInput,
): Promise<void> {
  submitting.value = true;
  try {
    if (sceneFormMode.value === 'create') {
      await store.createScene(props.projectId, input as CreateSceneInput);
      ElMessage.success('场景已创建');
    } else if (editingSceneId.value) {
      await store.updateScene(editingSceneId.value, input as UpdateSceneInput);
      ElMessage.success('场景已更新');
    }
    sceneFormVisible.value = false;
  } catch {
    ElMessage.error(
      store.error ||
        (sceneFormMode.value === 'create' ? '场景创建失败' : '场景更新失败'),
    );
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
    ElMessage.error(store.error || '场景删除失败');
  }
}
</script>

<template>
  <div class="management-page project-detail-page">
    <ElSkeleton v-if="loading && !currentProject" :rows="8" animated />
    <template v-else-if="currentProject">
      <section class="project-detail-hero">
        <div class="project-detail-hero__cover">
          <img
            v-if="currentProject.coverKey?.startsWith('http')"
            :src="currentProject.coverKey"
            :alt="currentProject.name"
          />
          <span v-else>{{ currentProject.name.slice(0, 1) }}</span>
        </div>
        <div class="project-detail-hero__copy">
          <div class="project-detail-hero__title">
            <h1>{{ currentProject.name }}</h1>
          </div>
          <div class="project-detail-hero__meta">
            <span
              ><ElIcon><Setting /></ElIcon
              >{{ currentProject.code || '未设置编码' }}</span
            ><span
              ><ElIcon><Calendar /></ElIcon>更新于
              {{ formatTime(currentProject.updatedAt) }}</span
            >
          </div>
        </div>
        <div class="project-detail-hero__actions">
          <ElButton @click="openEditDialog"
            ><ElIcon><Edit /></ElIcon> 编辑资料</ElButton
          ><ElButton
            type="primary"
            data-testid="create-scene"
            @click="openCreateDialog"
            ><ElIcon><Plus /></ElIcon> 新建场景</ElButton
          >
        </div>
      </section>

      <section class="project-workspace-section">
        <ElEmpty
          v-if="currentProject.scenes.length === 0"
          description="当前项目暂无场景"
          ><ElButton type="primary" @click="openCreateDialog"
            >创建第一个场景</ElButton
          ></ElEmpty
        >
        <div v-else class="scene-card-grid">
          <ElCard
            v-for="scene in currentProject.scenes"
            :key="scene.id"
            class="scene-card product-card"
            shadow="hover"
          >
            <div class="scene-card__cover">
              <img
                v-if="scene.coverKey?.startsWith('http')"
                :src="scene.coverKey"
                :alt="scene.name"
              /><span v-else class="scene-card__initial">{{
                scene.name.slice(0, 1)
              }}</span
              ><small>REV {{ scene.revision }}</small
              ><ElTag v-if="scene.contentHash" type="success" effect="dark"
                >已保存</ElTag
              ><ElTag v-else type="info" effect="dark">未配置</ElTag>
            </div>
            <div class="scene-card__body">
              <div class="scene-card__title-row">
                <div>
                  <RouterLink
                    :to="`/editor/${currentProject.id}/${scene.id}`"
                    :data-testid="`open-scene-${scene.id}`"
                    ><h3>{{ scene.name }}</h3></RouterLink
                  ><span>更新于 {{ formatTime(scene.updatedAt) }}</span>
                </div>
                <ElButton
                  text
                  circle
                  title="编辑场景"
                  @click="openEditSceneDialog(scene)"
                  ><ElIcon><Edit /></ElIcon
                ></ElButton>
              </div>
              <p>
                {{
                  scene.description?.trim() ||
                  (scene.contentHash
                    ? '场景文档已保存，可继续编辑数字孪生空间。'
                    : '空场景，拖入模型和灯光开始搭建。')
                }}
              </p>
              <div class="scene-card__actions">
                <RouterLink :to="`/editor/${currentProject.id}/${scene.id}`"
                  ><ElButton type="primary" size="small"
                    ><ElIcon><VideoPlay /></ElIcon> 进入编辑器</ElButton
                  ></RouterLink
                ><ElButton size="small" @click="copyScene(scene.id)"
                  ><ElIcon><CopyDocument /></ElIcon> 复制</ElButton
                ><ElButton
                  type="danger"
                  plain
                  size="small"
                  @click="deleteScene(scene.id, scene.name)"
                  ><ElIcon><Delete /></ElIcon> 删除</ElButton
                >
              </div>
            </div>
          </ElCard>
        </div>
      </section>
    </template>
    <ElAlert v-else-if="error" :title="error" type="error" :closable="false" />
    <ElEmpty v-else description="项目不存在或已被删除"
      ><RouterLink to="/projects"
        ><ElButton type="primary">返回项目列表</ElButton></RouterLink
      ></ElEmpty
    >

    <SceneFormDialog
      v-model="sceneFormVisible"
      :mode="sceneFormMode"
      :scene="editingScene"
      :submitting="submitting"
      :test-id="
        sceneFormMode === 'create' ? 'scene-dialog' : 'scene-edit-dialog'
      "
      @submit="submitScene"
    />
    <ProjectFormDialog
      v-model="editDialogVisible"
      mode="edit"
      :project="currentProject"
      :submitting="submitting"
      @submit="updateProject"
    />
  </div>
</template>
