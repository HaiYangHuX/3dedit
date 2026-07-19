import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EditorHelpPanel from '../src/components/editor/EditorHelpPanel.vue';

describe('EditorHelpPanel', () => {
  it('按原站分组展示编辑器快捷键和第一人称移动键', () => {
    const wrapper = mount(EditorHelpPanel);

    expect(wrapper.get('[data-testid="editor-help-panel"]').text()).toContain(
      '快捷键',
    );
    expect(wrapper.text()).toContain('Ctrl/Cmd+Z');
    expect(wrapper.text()).toContain('左键平移 / 右键旋转 / 滚轮缩放');
    expect(wrapper.text()).toContain('不计入撤销');
    expect(wrapper.text()).toContain('第一人称模式');
    expect(wrapper.text()).toContain('W');
    expect(wrapper.text()).toContain('S');
    expect(wrapper.text()).toContain('A');
    expect(wrapper.text()).toContain('D');
  });
});
