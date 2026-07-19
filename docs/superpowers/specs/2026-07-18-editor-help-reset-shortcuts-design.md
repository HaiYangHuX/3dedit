# 编辑器重置、帮助与快捷键对齐设计

## 目标

参照 数字孪生 编辑器的右侧帮助面板和视口快捷键语义，补齐当前编辑器的“重置场景”入口，移除顶部撤销/重做按钮，并保留 Ctrl/Cmd 快捷键能力。场景仍遵循显式保存策略：重置、编辑和快捷键只修改本地文档，只有点击保存才提交服务端。

## 交互设计

- 顶部工具栏保留保存、预览、发布，新增带确认的“重置场景”；撤销/重做按钮移除。
- 右侧检查器新增“帮助”标签，分为“快捷键”和“第一人称模式”两组，展示 W/E/R、F/双击材质、Delete/Backspace、多选、Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、右键移动镜头及 W/S/A/D。
- 重置场景恢复默认空文档：清空节点、交互、数据源、Socket 任务、资产引用，恢复项目配置、Camera 和漫游路径；保留场景 ID、项目 ID、名称和服务端 revision。
- 重置结果进入 dirty 状态并显示提示，用户必须再次点击保存；预览/发布不会隐式保存。
- 快捷键监听使用捕获阶段、`event.code` 优先并兼容 `event.key`，输入框、文本域和 contenteditable 内不拦截。第一人称或测量模式接管 W/E/R/F/A/S/D，避免误切换变换工具；画布双击命中材质时复用 F 的聚焦逻辑。

## 架构与数据流

`ResetSceneCommand` 位于 `editor-core`，保存重置前快照并通过现有 `notifyDocumentChanged` 重建资产引用。执行和撤销都保留当前 revision；`useEditorCommands.resetScene()` 清理选择并调用 `EditorCanvas.loadDocument()`，保证 Three 场景使用同一份完整文档重建。Vue 工作台只负责确认、状态面板和提示。

## 异常处理

- 用户取消确认不改变文档。
- Engine 重建失败时保留 dirty 文档并展示统一错误，不触发保存。
- 服务端 revision 不由重置或撤销回退，避免下一次显式保存产生错误的并发版本。

## 验证

- editor-core：重置默认值、revision 保留、撤销恢复。
- editor-web：帮助面板文案、顶部按钮结构、确认式重置、快捷键 key/code 兼容和 Engine 重载调用。
- 运行全量测试、类型检查、Lint、格式检查和构建。
