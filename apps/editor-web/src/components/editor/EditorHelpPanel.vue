<script setup lang="ts">
interface HelpRow {
  label: string;
  value: string;
}

// 文案与源站帮助面板保持同一组快捷键，避免工具提示和帮助页出现两套规则。
const shortcutRows: HelpRow[] = [
  { label: '移动', value: 'W' },
  { label: '旋转', value: 'E' },
  { label: '缩放', value: 'R' },
  { label: '聚焦', value: 'F / 鼠标双击材质' },
  { label: '删除', value: 'Delete / Backspace' },
  { label: '多选', value: 'Ctrl/Cmd+长按鼠标左键框选/松开' },
  { label: '撤销', value: 'Ctrl/Cmd+Z' },
  { label: '重做', value: 'Ctrl/Cmd+Shift+Z' },
  {
    label: '镜头导航',
    value: '左键平移 / 右键旋转 / 滚轮缩放（不计入撤销）',
  },
];

const firstPersonRows: HelpRow[] = [
  { label: '前进', value: 'W' },
  { label: '后退', value: 'S' },
  { label: '左移', value: 'A' },
  { label: '右移', value: 'D' },
];
</script>

<template>
  <section class="editor-help-panel" data-testid="editor-help-panel">
    <div class="editor-help-scroll">
      <section class="editor-help-section">
        <h3>快捷键</h3>
        <dl class="editor-help-list">
          <div v-for="row in shortcutRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </section>
      <section class="editor-help-section">
        <h3>第一人称模式</h3>
        <dl class="editor-help-list">
          <div v-for="row in firstPersonRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </section>
</template>
