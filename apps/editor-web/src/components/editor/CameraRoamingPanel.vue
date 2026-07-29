<script setup lang="ts">
import type { CameraRoamingPath } from '@digital-twin/scene-schema';
import type { CameraRoamingState } from '@digital-twin/three-engine';
import {
  Delete,
  EditPen,
  Location,
  Plus,
  VideoCamera,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue';
import {
  ElButton,
  ElDialog,
  ElIcon,
  ElInputNumber,
  ElMessage,
  ElScrollbar,
  ElTable,
  ElTableColumn,
  ElTooltip,
} from 'element-plus';
import { ref } from 'vue';

const props = defineProps<{
  paths: readonly CameraRoamingPath[];
  state: CameraRoamingState;
}>();

const emit = defineEmits<{
  'start-drawing': [];
  'cancel-drawing': [];
  preview: [pathId: string];
  stop: [];
  remove: [pathId: string];
  hover: [pathId: string];
  leave: [];
  'update-speed': [pathId: string, speed: number];
  'update-points': [
    pathId: string,
    pathPoints: Array<[number, number, number]>,
  ];
}>();

interface PointDraft {
  x: number | undefined;
  y: number | undefined;
  z: number | undefined;
}

const editorVisible = ref(false);
const editingPathId = ref<string>();
const editingPathName = ref('');
const pointDraft = ref<PointDraft[]>([]);

function changeSpeed(pathId: string, value: number | undefined): void {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value < 0.1 ||
    value > 50
  ) {
    return;
  }
  const path = props.paths.find((item) => item.id === pathId);
  if (path?.speed !== value) emit('update-speed', pathId, value);
}

function openPointEditor(path: CameraRoamingPath): void {
  editingPathId.value = path.id;
  editingPathName.value = path.name;
  // 编辑草稿与 SceneDocument 隔离，取消弹窗不会污染命令历史或显式保存状态。
  pointDraft.value = path.pathPoints.map(([x, y, z]) => ({ x, y, z }));
  editorVisible.value = true;
}

function resetPointEditor(): void {
  editingPathId.value = undefined;
  editingPathName.value = '';
  pointDraft.value = [];
}

function savePoints(): void {
  const pathId = editingPathId.value;
  if (!pathId) return;
  if (pointDraft.value.length < 2) {
    ElMessage.warning('漫游路径至少需要 2 个点位');
    return;
  }
  const points: Array<[number, number, number]> = [];
  for (const point of pointDraft.value) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) {
      ElMessage.warning('点位坐标必须是有效数字');
      return;
    }
    points.push([point.x!, point.y!, point.z!]);
  }
  emit('update-points', pathId, points);
  editorVisible.value = false;
}

function pointRole(index: number): string {
  if (index === 0) return '起点';
  if (index === pointDraft.value.length - 1) return '终点';
  return '途经点';
}
</script>

<template>
  <section class="camera-roaming">
    <div class="cr-body">
      <div v-if="paths.length === 0" class="cr-empty">
        <div class="cr-empty__icon">
          <ElIcon :size="22"><VideoCamera /></ElIcon>
        </div>
        <p class="cr-empty__title">暂无漫游路径</p>
        <p class="cr-empty__hint">点击下方按钮进入绘制模式</p>
      </div>

      <ElScrollbar v-else max-height="320px" class="cr-scroll">
        <article
          v-for="(path, index) in paths"
          :key="path.id"
          class="cr-item"
          :class="{ 'cr-item--active': state.activePathId === path.id }"
          @mouseenter="emit('hover', path.id)"
          @mouseleave="emit('leave')"
        >
          <div class="cr-item__badge">{{ index + 1 }}</div>
          <div class="cr-item__info">
            <span class="cr-item__name" :title="path.name">{{
              path.name
            }}</span>
            <span class="cr-item__meta">
              <ElIcon :size="10"><Location /></ElIcon>
              {{ path.pathPoints.length }} 个点位
            </span>
          </div>

          <div class="cr-item__controls">
            <div class="cr-item__speed" title="漫游速度（单位/秒）">
              <span class="cr-item__speed-label">速度</span>
              <ElInputNumber
                :model-value="path.speed"
                :data-testid="`roaming-speed-${path.id}`"
                :min="0.1"
                :max="50"
                :step="0.5"
                :precision="1"
                :controls="false"
                size="small"
                @change="(value) => changeSpeed(path.id, value)"
              />
            </div>

            <div class="cr-item__actions">
              <ElTooltip content="编辑点位" placement="top">
                <button
                  type="button"
                  class="cr-btn cr-btn--edit"
                  :aria-label="`编辑${path.name} 点位`"
                  @click="openPointEditor(path)"
                >
                  <ElIcon :size="16"><EditPen /></ElIcon>
                </button>
              </ElTooltip>
              <ElTooltip
                :content="
                  state.activePathId === path.id ? '停止预览' : '预览路径'
                "
                placement="top"
              >
                <button
                  type="button"
                  class="cr-btn cr-btn--play"
                  :class="{ 'is-active': state.activePathId === path.id }"
                  :aria-label="`${state.activePathId === path.id ? '停止' : '播放'}${path.name}`"
                  @click="
                    state.activePathId === path.id
                      ? emit('stop')
                      : emit('preview', path.id)
                  "
                >
                  <ElIcon :size="16">
                    <VideoPause v-if="state.activePathId === path.id" />
                    <VideoPlay v-else />
                  </ElIcon>
                </button>
              </ElTooltip>
              <ElTooltip content="删除路径" placement="top">
                <button
                  type="button"
                  class="cr-btn cr-btn--delete"
                  :aria-label="`删除${path.name}`"
                  @click="emit('remove', path.id)"
                >
                  <ElIcon :size="16"><Delete /></ElIcon>
                </button>
              </ElTooltip>
            </div>
          </div>
        </article>
      </ElScrollbar>
    </div>

    <div class="cr-footer">
      <button
        type="button"
        class="cr-add-btn"
        aria-label="添加漫游路径"
        :disabled="state.mode !== 'idle'"
        @click="emit('start-drawing')"
      >
        <span class="cr-add-btn__icon"
          ><ElIcon><Plus /></ElIcon
        ></span>
        <span>添加漫游路径</span>
      </button>
    </div>

    <ElDialog
      v-model="editorVisible"
      :title="`编辑点位 · ${editingPathName}`"
      width="520px"
      append-to-body
      destroy-on-close
      class="cr-edit-dialog"
      @closed="resetPointEditor"
    >
      <ElTable
        :data="pointDraft"
        border
        size="small"
        :max-height="360"
        class="cr-edit-table"
      >
        <ElTableColumn label="序号" width="76" align="center">
          <template #default="{ $index }">
            <span class="cr-point-role" :class="`is-${pointRole($index)}`">
              {{ $index + 1 }} · {{ pointRole($index) }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="X" align="center">
          <template #default="{ row, $index }">
            <ElInputNumber
              v-model="row.x"
              :data-testid="`roaming-point-${$index}-x`"
              :precision="3"
              :step="0.1"
              :controls="false"
              size="small"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="Y" align="center">
          <template #default="{ row, $index }">
            <ElInputNumber
              v-model="row.y"
              :data-testid="`roaming-point-${$index}-y`"
              :precision="3"
              :step="0.1"
              :controls="false"
              size="small"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="Z" align="center">
          <template #default="{ row, $index }">
            <ElInputNumber
              v-model="row.z"
              :data-testid="`roaming-point-${$index}-z`"
              :precision="3"
              :step="0.1"
              :controls="false"
              size="small"
            />
          </template>
        </ElTableColumn>
      </ElTable>

      <template #footer>
        <ElButton @click="editorVisible = false">取消</ElButton>
        <ElButton type="primary" aria-label="保存漫游点位" @click="savePoints">
          保存
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>
