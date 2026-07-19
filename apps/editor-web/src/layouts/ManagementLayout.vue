<script setup lang="ts">
import {
  DataAnalysis,
  Files,
  Fold,
  FolderOpened,
  Expand,
} from '@element-plus/icons-vue';
import { ElButton, ElIcon, ElMenu, ElMenuItem, ElTooltip } from 'element-plus';
import { computed, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const collapsed = ref(false);
const menuItems = [
  {
    index: '/projects',
    label: '项目管理',
    icon: FolderOpened,
  },
  {
    index: '/assets',
    label: '模型与素材库',
    icon: Files,
  },
];
const activeMenu = computed(() => {
  if (route.path.startsWith('/assets')) return '/assets';
  return '/projects';
});
const pageTitle = computed(() =>
  activeMenu.value === '/assets'
    ? '模型与素材库'
    : route.params.projectId
      ? '项目工作台'
      : '项目管理',
);

function navigate(index: string): void {
  void router.push(index);
}
</script>

<template>
  <div
    class="management-shell"
    :class="{ 'management-shell--collapsed': collapsed }"
  >
    <aside class="management-sidebar">
      <div class="management-brand">
        <div class="management-brand__mark">
          <ElIcon><DataAnalysis /></ElIcon>
        </div>
        <div v-if="!collapsed" class="management-brand__copy">
          <strong>数字孪生</strong>
        </div>
      </div>

      <ElMenu
        :default-active="activeMenu"
        :collapse="collapsed"
        class="management-menu"
        :collapse-transition="false"
        @select="navigate"
      >
        <ElMenuItem
          v-for="item in menuItems"
          :key="item.index"
          :index="item.index"
        >
          <ElIcon><component :is="item.icon" /></ElIcon>
          <template #title>
            <span>{{ item.label }}</span>
          </template>
        </ElMenuItem>
      </ElMenu>

      <div class="management-sidebar__footer">
        <ElTooltip
          :content="collapsed ? '展开导航' : '收起导航'"
          placement="right"
        >
          <ElButton
            text
            class="management-collapse-button"
            :aria-label="collapsed ? '展开导航' : '收起导航'"
            @click="collapsed = !collapsed"
          >
            <ElIcon><component :is="collapsed ? Expand : Fold" /></ElIcon>
            <span v-if="!collapsed">收起导航</span>
          </ElButton>
        </ElTooltip>
      </div>
    </aside>

    <section class="management-main">
      <header class="management-topbar">
        <div class="management-breadcrumb">
          <span class="management-breadcrumb__root">控制台</span>
          <span>/</span>
          <strong>{{ pageTitle }}</strong>
        </div>
      </header>
      <main class="management-content">
        <RouterView />
      </main>
    </section>
  </div>
</template>
