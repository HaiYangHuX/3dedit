# 运行时交互、WebSocket 与无版本发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有多模型场景编辑器之上完成强类型低代码交互、WebSocket 数据驱动、纯运行时预览和 MinIO 原子发布闭环，并确保运行时不携带任何编辑器依赖。

**Architecture:** `scene-schema` 保存可验证的触发器、条件、动作、数据源与 Socket 任务；新增的 `runtime-core` 只依赖场景协议，通过 `RuntimeHost` 端口驱动三维对象，不直接依赖 Vue 或 Three.js。`three-engine` 新增不含 TransformControls/选择历史/编辑辅助对象的 `RuntimeThreeEngine` 并实现 Host 端口；`runtime-web` 同时承载当前草稿预览与发布运行时；NestJS 发布模块先生成 MinIO 临时发布包，再以单行 Publication 指针原子切换，成功后清理旧包。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、Three.js `0.183.0`、`@types/three@0.183.1`、Zod、NestJS 11、Fastify、Prisma、PostgreSQL、MinIO、标准 WebSocket、Vitest、Playwright。

## Global Constraints

- 不实现登录、账号、权限、多租户、业务场景版本或业务发布版本。
- Three.js 与类型声明继续精确锁定 `0.183.0` / `0.183.1`，以实际 runtime API 为准。
- `runtime-core` 不依赖 Vue、Pinia、Element Plus 或 Three.js；`runtime-web` 不依赖 `editor-core`。
- `/runtime/:publicationId` 不加载 TransformControls、选择辅助对象、命令历史或 Element Plus。
- WebSocket 销毁必须同步清理连接、心跳、指数退避重连、定时触发器和待执行延迟动作。
- 条件系统只读取声明式 Operand，不执行任意 JavaScript 或 `eval`。
- 发布包必须包含 Manifest、场景 JSON 和独立资源副本；数据库只保留当前 Publication 指针。
- 发布失败不能覆盖当前线上指针；发布成功后才能异步清理旧内部 release 前缀。
- Three.js 异步加载继续使用代次隔离；运行时销毁释放 RAF、Observer、Controls、Pass、RenderTarget、模型和监听器。
- 新增核心协议、异步并发边界、清理逻辑、重试和发布事务必须写清晰有效的中文注释。

---

### Task 1: 将交互与 Socket 配置收敛为强类型场景协议

**Files:**
- Modify: `packages/scene-schema/src/schema.ts`
- Modify: `packages/scene-schema/src/index.ts`
- Modify: `packages/scene-schema/tests/sceneDocument.test.ts`

**Interfaces:**
- Produces: `TriggerDefinition`，覆盖 `scene-load`、`click`、`double-click`、`pointer-enter`、`pointer-leave`、`timer`、`websocket`、`variable-change`。
- Produces: `ConditionDefinition { left; operator; right? }` 与递归 `ConditionGroup { logic; conditions }`。
- Produces: `ActionDefinition`，覆盖显隐、变换、颜色、高亮、动画/视频控制、文本/图表更新、相机聚焦、变量、链接和延迟。
- Produces: `DataSourceDefinition`、`SocketTaskDefinition`、`SocketTaskType`。

- [ ] **Step 1: 写强类型协议失败测试**

```ts
const document = createDefaultSceneDocument('project', 'scene', '场景');
document.interactions.push({
  id: 'interaction-1',
  name: '单击显示设备',
  enabled: true,
  sourceNodeId: 'button',
  trigger: { type: 'click' },
  conditions: {
    logic: 'all',
    conditions: [
      {
        left: { source: 'variable', key: 'enabled' },
        operator: 'eq',
        right: { source: 'literal', value: true },
      },
    ],
  },
  execution: 'sequential',
  actions: [{ type: 'set-visibility', nodeId: 'device', visible: true }],
});
expect(sceneDocumentSchema.safeParse(document).success).toBe(true);
expect(
  sceneDocumentSchema.safeParse({
    ...document,
    interactions: [{ ...document.interactions[0], actions: [{ type: 'eval', code: 'alert(1)' }] }],
  }).success,
).toBe(false);
```

- [ ] **Step 2: 运行测试确认当前宽泛 record 接受非法动作**

Run: `pnpm --filter @digital-twin/scene-schema test`

Expected: FAIL，非法 `eval` 动作仍能通过当前 schema。

- [ ] **Step 3: 实现可辨识联合协议与导出类型**

Operand 使用 `literal`、`variable`、`message`、`node-visible` 四种来源；消息路径只允许点号分段的安全字段读取。Condition operator 固定为 `eq/ne/gt/gte/lt/lte/contains/truthy/falsy`。Action 使用 `type` 可辨识联合，持续时间统一为非负 `durationMs`，缓动统一为 `linear/ease-in/ease-out/ease-in-out`。

- [ ] **Step 4: 补齐引用不变量验证**

`superRefine` 拒绝不存在的 `sourceNodeId`、动作目标节点、Socket task 目标节点和不存在的 dataSource；同一文档内 interaction/dataSource/socketTask ID 及 taskCode 必须唯一。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/scene-schema test && pnpm --filter @digital-twin/scene-schema typecheck`

```bash
git add packages/scene-schema
git commit -m "💥 feat(场景协议): 强类型化交互与Socket任务"
```

---

### Task 2: 创建框架无关的 runtime-core 与条件执行器

**Files:**
- Create: `packages/runtime-core/package.json`
- Create: `packages/runtime-core/tsconfig.json`
- Create: `packages/runtime-core/src/types.ts`
- Create: `packages/runtime-core/src/values/readOperand.ts`
- Create: `packages/runtime-core/src/conditions/evaluateConditions.ts`
- Create: `packages/runtime-core/src/actions/ActionRunner.ts`
- Create: `packages/runtime-core/src/SceneRuntime.ts`
- Create: `packages/runtime-core/src/index.ts`
- Create: `packages/runtime-core/tests/evaluateConditions.test.ts`
- Create: `packages/runtime-core/tests/ActionRunner.test.ts`
- Create: `packages/runtime-core/tests/SceneRuntime.test.ts`

**Interfaces:**
- Consumes: `SceneDocument`、`InteractionDefinition`、`ActionDefinition`。
- Produces: `RuntimeHost`，包含 `setVisibility`、`setTransform`、`setColor`、`setHighlight`、`focusNode`、`controlAnimation`、`controlVideo`、`setText`、`setChartData`、`openLink`、`subscribeNodeEvent`。
- Produces: `SceneRuntime.load(document)`、`start()`、`emitTrigger(event)`、`setVariable(key, value)`、`getVariable(key)`、`dispose()`。
- Produces: `RuntimeDiagnostic { level; source; message; timestamp; detail? }`。

- [ ] **Step 1: 写 Operand、条件树和动作顺序失败测试**

```ts
expect(
  evaluateConditionGroup(group, {
    variables: { temperature: 36 },
    message: { device: { online: true } },
    isNodeVisible: () => true,
  }),
).toBe(true);

await runner.run(
  [
    { type: 'set-variable', key: 'phase', value: 1 },
    { type: 'delay', durationMs: 20 },
    { type: 'set-variable', key: 'phase', value: 2 },
  ],
  'sequential',
  context,
);
expect(events).toEqual(['phase:1', 'phase:2']);
```

- [ ] **Step 2: 运行测试确认 runtime-core 不存在**

Run: `pnpm --filter @digital-twin/runtime-core test`

Expected: FAIL，workspace package 尚不存在。

- [ ] **Step 3: 实现安全值读取与条件树**

`readOperand` 对 message path 逐段读取普通对象，拒绝 `__proto__`、`prototype`、`constructor`；比较不做隐式数字字符串转换；`contains` 只接受字符串或数组；任何不可读取值均令当前原子条件为 false，并产生 debug diagnostic 而不是抛垮运行时。

- [ ] **Step 4: 实现可取消的串并行动作执行器**

每次运行创建 AbortController；串行按声明顺序 await，并行通过 `Promise.allSettled` 等待全部动作；`delay` 监听 abort 并清理 timer；单个 Host 动作失败写 error diagnostic，串行停止当前交互、并行继续收集其他结果。

- [ ] **Step 5: 实现场景运行生命周期**

`start()` 注册节点事件、scene-load 和 timer 触发器；`emitTrigger` 先匹配 enabled interaction，再计算条件并执行；variable-change 只有值真正变化时触发；`dispose()` 取消全部动作、定时器和 Host 订阅，晚到 Promise 不得继续修改场景。

- [ ] **Step 6: 验证并提交**

Run: `pnpm --filter @digital-twin/runtime-core test && pnpm --filter @digital-twin/runtime-core typecheck`

```bash
git add packages/runtime-core pnpm-lock.yaml
git commit -m "💥 feat(运行时内核): 实现条件与动作执行生命周期"
```

---

### Task 3: 实现 WebSocket 心跳、重连、任务映射和诊断日志

**Files:**
- Create: `packages/runtime-core/src/socket/types.ts`
- Create: `packages/runtime-core/src/socket/WebSocketConnection.ts`
- Create: `packages/runtime-core/src/socket/SocketTaskRunner.ts`
- Create: `packages/runtime-core/src/socket/WebSocketRuntime.ts`
- Modify: `packages/runtime-core/src/SceneRuntime.ts`
- Modify: `packages/runtime-core/src/index.ts`
- Create: `packages/runtime-core/tests/WebSocketConnection.test.ts`
- Create: `packages/runtime-core/tests/SocketTaskRunner.test.ts`

**Interfaces:**
- Produces: `WebSocketFactory(url): WebSocketLike`，便于浏览器使用原生 WebSocket、测试使用内存实现。
- Produces: `WebSocketConnection.connect()`、`disconnect()`、`status`、`subscribeStatus()`、`subscribeMessage()`。
- Produces: `SocketTaskRunner.run(message)`，按 `taskCode` 执行强类型任务。
- Produces: `WebSocketRuntime.start(document)`、`stop()`、`injectMessage(dataSourceId, payload)`。

- [ ] **Step 1: 写心跳和指数退避失败测试**

使用 Vitest fake timers 与内存 Socket：首次 close 后等待 1000ms 重连，第二次等待 2000ms，最大延迟封顶 30000ms；主动 `disconnect()` 后即使推进计时也不再连接；连接成功后按 `heartbeatMs` 发送配置的 heartbeat payload。

- [ ] **Step 2: 写任务映射失败测试**

```ts
await runner.run({
  taskCode: 'device-position',
  taskType: 'position',
  taskTime: 300,
  taskData: { x: 10, y: 0, z: 5 },
});
expect(host.setTransform).toHaveBeenCalledWith(
  'device',
  { position: [10, 0, 5] },
  { durationMs: 300, easing: 'linear' },
);
```

- [ ] **Step 3: 实现连接状态机**

状态为 `idle/connecting/open/reconnecting/closed/error`；每个连接代次绑定独立 handler，旧 socket 的 late message/close 被忽略；open 时重置 attempt；指数退避为 `min(1000 * 2 ** attempt, 30000)`，超过 `reconnectLimit` 后进入 closed；心跳内容默认 `{"type":"ping"}`。

- [ ] **Step 4: 实现消息解析和 Socket 任务**

接受 JSON 字符串、Object 或数组；数组逐条执行；用 `taskCode` 找到文档任务，消息显式 taskType/taskTime/taskData 可覆盖任务默认值但必须重新通过 Zod 子协议解析。位置、旋转、缩放、显隐、颜色、文本、图表、视频、动画和相机分别调用 RuntimeHost，不识别任务只写 warning diagnostic。

- [ ] **Step 5: 接入 SceneRuntime 并验证销毁**

WebSocket 消息同时触发对应 `websocket` interaction；`dispose()` 先禁止新消息，再关闭 socket、清理心跳/重连，最后取消正在运行的任务和交互动作。

- [ ] **Step 6: 验证并提交**

Run: `pnpm --filter @digital-twin/runtime-core test && pnpm --filter @digital-twin/runtime-core typecheck`

```bash
git add packages/runtime-core
git commit -m "💥 feat(WebSocket运行时): 完成心跳重连与任务映射"
```

---

### Task 4: 新增无编辑依赖的 RuntimeThreeEngine

**Files:**
- Modify: `packages/three-engine/package.json`
- Create: `packages/three-engine/src/runtime/RuntimePointerSystem.ts`
- Create: `packages/three-engine/src/runtime/RuntimeHostAdapter.ts`
- Create: `packages/three-engine/src/RuntimeThreeEngine.ts`
- Modify: `packages/three-engine/src/documents/SceneDocumentSystem.ts`
- Modify: `packages/three-engine/src/index.ts`
- Create: `packages/three-engine/tests/RuntimePointerSystem.test.ts`
- Create: `packages/three-engine/tests/RuntimeHostAdapter.test.ts`
- Create: `packages/three-engine/tests/runtimeDependencies.test.ts`

**Interfaces:**
- Consumes: `RuntimeHost` from `@digital-twin/runtime-core`。
- Produces: `RuntimeThreeEngine.initialize(container)`、`loadDocument(document, resolver)`、`createHost()`、`resize()`、`dispose()`。
- Produces: Host 实现节点显隐/变换/材质颜色/高亮/相机聚焦和 pointer 事件。
- Produces: `SceneDocumentSystem.replaceNode(node)`，当 model assetId 或组件主类型改变时安全异步重建。

- [ ] **Step 1: 写运行时依赖边界与 pointer 失败测试**

断言 `RuntimeThreeEngine.ts` 不导入 `TransformControls`、`SelectionSystem`、`editor-core`；pointer 坐标基于 canvas rect；子 Mesh 命中上溯到 SceneNode 根；click、double-click、enter、leave 都使用稳定 nodeId。

- [ ] **Step 2: 写 Host 动作失败测试**

断言隐藏祖先、修改 transform、修改模型子 Mesh 材质颜色、Outline 高亮、聚焦和 dispose；颜色修改先 clone 共享材质，不能污染同一模型的另一个实例；持续动画在新动作或销毁时被取消。

- [ ] **Step 3: 实现纯运行时 Three.js 生命周期**

运行时只创建 Scene、PerspectiveCamera、WebGLRenderer、OrbitControls、EffectComposer、RenderPass、共享 OutlinePass、SceneDocumentSystem、SceneSettingsSystem 与 RuntimePointerSystem。不得创建 GridHelper、编辑环境辅助光、TransformControls 或 SelectionSystem。Composer 启用时仍是每帧唯一最终渲染路径。

- [ ] **Step 4: 实现 RuntimeHostAdapter**

transform 动作使用 rAF tween 与可取消句柄；rotation 始终使用弧度；颜色更新遍历业务根下 Mesh，并 clone 需要修改的 Material；文本/图表/视频/动画组件尚无具体 Three 对象时将数据写入业务根 `userData.runtimeState`，供对应组件系统在后续阶段消费，不得静默丢弃任务。

- [ ] **Step 5: 修复节点主组件异步重建**

`SceneDocumentSystem.replaceNode` 先创建新对象，再在旧对象相同父级/索引处原子替换；创建失败保留旧对象；加载代次变化时释放新对象；替换后释放旧模型实例或独占资源。

- [ ] **Step 6: 验证并提交**

Run: `pnpm --filter @digital-twin/three-engine test && pnpm --filter @digital-twin/three-engine typecheck`

```bash
git add packages/three-engine pnpm-lock.yaml
git commit -m "💥 feat(三维运行时): 建立纯运行时引擎与交互端口"
```

---

### Task 5: 实现 runtime-web 草稿预览与发布运行路由

**Files:**
- Modify: `apps/runtime-web/package.json`
- Create: `apps/runtime-web/src/api/client.ts`
- Create: `apps/runtime-web/src/api/runtime.ts`
- Create: `apps/runtime-web/src/runtime/runtimeAssetResolver.ts`
- Create: `apps/runtime-web/src/views/RuntimeView.vue`
- Create: `apps/runtime-web/src/router.ts`
- Modify: `apps/runtime-web/src/RuntimeCanvas.vue`
- Modify: `apps/runtime-web/src/App.vue`
- Modify: `apps/runtime-web/src/main.ts`
- Modify: `apps/runtime-web/tests/runtimeDependencies.test.ts`
- Create: `apps/runtime-web/tests/runtimeAssetResolver.test.ts`
- Create: `apps/runtime-web/tests/RuntimeView.test.ts`

**Interfaces:**
- Preview consumes: `GET /api/scenes/:sceneId` 与 `GET /api/assets/:assetId/download`。
- Publication consumes: `GET /api/publications/:publicationId/manifest` 与 Manifest 内资源地址。
- Routes: `/preview/:sceneId`、`/runtime/:publicationId`。
- Produces DOM observability: `data-runtime-ready`、`data-runtime-mode`、`data-scene-object-count`、`data-socket-status`、`data-last-task-code`。

- [ ] **Step 1: 写路由加载与依赖失败测试**

断言 preview 请求当前 SceneDetail，runtime 只请求发布 Manifest；加载代次变化时旧请求结果不覆盖新路由；package dependencies 不包含 `element-plus` 或 `@digital-twin/editor-core`，代码不导入 `EditorEngine`。

- [ ] **Step 2: 实现 API 与资源解析器**

统一 `VITE_API_BASE_URL`，默认 `/api`；所有响应先通过共享 Zod contract 校验；preview resolver 使用 Asset download endpoint，publication resolver 只读 Manifest 中按 assetId 索引的独立发布资源，不能回退到模型库当前文件。

- [ ] **Step 3: 改造 RuntimeCanvas 生命周期**

组件创建 `RuntimeThreeEngine` 和 `SceneRuntime`；先加载三维文档再 start 交互；route document 改变时先 dispose 旧 SceneRuntime，再 load 新文档；卸载时按 SceneRuntime → RuntimeThreeEngine 顺序释放，防止动作访问已销毁 Object3D。

- [ ] **Step 4: 实现错误、加载与调试状态**

草稿 preview 显示可折叠诊断和 Socket 状态；正式 runtime 默认只显示加载/致命错误，`?debug=1` 时显示相同诊断。错误信息包含发布不存在、场景协议非法、资源失败和 WebSocket 重试耗尽。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @digital-twin/runtime-web test && pnpm --filter @digital-twin/runtime-web typecheck && pnpm --filter @digital-twin/runtime-web build`

```bash
git add apps/runtime-web pnpm-lock.yaml
git commit -m "💥 feat(运行时页面): 支持草稿预览与发布路由"
```

---

### Task 6: 实现 MinIO 原子发布包与 Publication API

**Files:**
- Create: `apps/api-server/prisma/migrations/0003_publication_runtime/migration.sql`
- Modify: `apps/api-server/prisma/schema.prisma`
- Create: `packages/api-contracts/src/publication.ts`
- Modify: `packages/api-contracts/src/index.ts`
- Modify: `packages/api-contracts/tests/contracts.test.ts`
- Modify: `apps/api-server/src/infrastructure/minio.service.ts`
- Create: `apps/api-server/src/publications/publication.service.ts`
- Create: `apps/api-server/src/publications/publication.controller.ts`
- Create: `apps/api-server/src/publications/publication.module.ts`
- Modify: `apps/api-server/src/app.module.ts`
- Create: `apps/api-server/tests/publication.service.test.ts`

**Interfaces:**
- Input: `PublishSceneInput { sceneId: string }`。
- Produces: `PublicationDetail { id; projectId; sceneId; status; contentHash; publishedAt; runtimeUrl; iframeCode }`。
- Produces: `PublicationManifest { schemaVersion: 1; publicationId; projectId; sceneId; contentHash; document; assets }`。
- Endpoints: `POST /projects/:projectId/publication`、`GET /projects/:projectId/publication`、`GET /publications/:id/manifest`、`GET /publications/:id/assets/:assetId`。
- MinIO produces: `putJson`、`getJson`、`copyObject`、`removePrefix`。

- [ ] **Step 1: 写 Contract 与服务失败测试**

覆盖：场景不属于项目返回 400；引用资源不存在或非 ready 返回 409；成功时复制每个 active AssetFile、写 scene.json 和 manifest.json 后才 upsert 指针；第二次发布成功后删除旧 prefix；新发布写包失败或数据库事务失败时当前 Publication 不变并清理新 prefix。

- [ ] **Step 2: 运行测试确认发布模块不存在**

Run: `pnpm --filter @digital-twin/api-contracts test && pnpm --filter @digital-twin/api-server test`

Expected: FAIL，publication contract/service 模块不存在。

- [ ] **Step 3: 扩展发布表和共享契约**

Publication 增加 `releaseId` 与 `sceneObjectKey`，`objectKey` 表示当前 manifest；仍保留 `projectId @unique`，不新增 publication history/release 表。Manifest assets 为 `Record<assetId, { format; mimeType; size; objectKey; url }>`，document 重新通过 sceneDocumentSchema 校验。

- [ ] **Step 4: 实现对象存储发布能力**

新内部前缀为 `publications/{publicationId}/releases/{randomReleaseId}/`；模型源文件复制到 `assets/{assetId}/{filename}`，然后写 `scene.json` 和最后的 `manifest.json`。`getJson` 限制最大字节数并在流结束后解析，防止错误对象拖垮 API 内存。

- [ ] **Step 5: 实现原子发布服务**

服务端不信任 document.assetReferences，重新从 model/environment 组件计算引用并查询 activeFile；所有对象写完后 Prisma transaction upsert 当前 Publication；事务成功后 best-effort 清理旧 release，清理失败只记录诊断不回滚已发布结果；任何前置失败清理新 release 并保持旧行不变。

- [ ] **Step 6: 实现只读运行时接口**

Manifest endpoint 从当前 objectKey 读取并校验；asset endpoint 只允许 manifest 中声明的 assetId/objectKey 并返回 1 小时 presigned URL 的 302 redirect，防止任意 objectKey 穿透读取。

- [ ] **Step 7: 验证并提交**

Run: `pnpm --filter @digital-twin/api-contracts test && pnpm --filter @digital-twin/api-server test && pnpm --filter @digital-twin/api-server typecheck`

```bash
git add apps/api-server packages/api-contracts pnpm-lock.yaml
git commit -m "💥 feat(场景发布): 实现MinIO原子发布包与当前指针"
```

---

### Task 7: 在编辑器中接入交互、Socket 配置、预演和发布操作

**Files:**
- Create: `packages/editor-core/src/commands/UpdateRuntimeConfigCommand.ts`
- Modify: `packages/editor-core/src/index.ts`
- Create: `packages/editor-core/tests/RuntimeConfigCommand.test.ts`
- Create: `apps/editor-web/src/api/publications.ts`
- Create: `apps/editor-web/src/components/editor/InteractionPanel.vue`
- Create: `apps/editor-web/src/components/editor/SocketTaskPanel.vue`
- Create: `apps/editor-web/src/components/editor/RuntimeDiagnostics.vue`
- Modify: `apps/editor-web/src/editor/useEditorCommands.ts`
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Create: `apps/editor-web/tests/InteractionPanel.test.ts`
- Create: `apps/editor-web/tests/SocketTaskPanel.test.ts`
- Modify: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- Produces: `UpdateRuntimeConfigCommand(section, before, after)`，section 为 `interactions/dataSources/socketTasks`。
- InteractionPanel emits: `update:interactions`，只输出完整可校验数组。
- SocketTaskPanel emits: `update:dataSources`、`update:socketTasks`、`simulate`。
- Workspace actions: `openPreview()`、`publish()`、`copyRuntimeUrl()`、`copyIframeCode()`。

- [ ] **Step 1: 写命令原子撤销与删除引用失败测试**

更新三个 runtime section 均通过 CommandHistory；undo 恢复完整数组；删除节点后相关 interaction 和 task 被清理，undo 节点删除时也恢复配置；复制/组合仍不复制外部交互引用。

- [ ] **Step 2: 写面板配置失败测试**

交互面板可添加触发器、条件组和多个动作并选择串/并行；Socket 面板可配置 URL、自动连接、heartbeat、重连次数、taskCode/taskType/target/taskTime/taskData；非法 URL、重复 taskCode、非法 JSON 禁止提交并就地展示中文错误。

- [ ] **Step 3: 实现命令与编辑器表单**

表单维护 draft，blur/change 时一次性执行命令，不能直接 mutate Pinia document；节点选择器只列出当前文档节点；删除数据源时同时删除其 Socket task，作为一次组合命令进入历史。

- [ ] **Step 4: 实现模拟消息与预览入口**

模拟消息先通过 Socket message schema，再在独立预览窗口发送 `postMessage` 调试指令；preview URL 使用 `VITE_RUNTIME_ORIGIN`，开发默认 `http://localhost:5174`。编辑器本身不创建第二套运行时，不污染 TransformControls 生命周期。

- [ ] **Step 5: 实现发布对话框**

发布前若 dirty 则先 await save；调用 Publication API 后展示访问地址和 iframe；重复发布替换当前指针但 UI 不显示版本列表；发布按钮显示 uploading/success/error，失败保留已有线上地址。

- [ ] **Step 6: 验证并提交**

Run: `pnpm --filter @digital-twin/editor-core test && pnpm --filter @digital-twin/editor-web test && pnpm --filter @digital-twin/editor-web typecheck`

```bash
git add packages/editor-core apps/editor-web
git commit -m "🌷 UI(交互发布): 接入交互Socket配置与发布操作"
```

---

### Task 8: 复制 r183 Decoder 资源并完成 HDR/PMREM 环境加载

**Files:**
- Create: `scripts/copy-three-decoders.mjs`
- Modify: `package.json`
- Modify: `packages/three-engine/src/assets/AssetLoader.ts`
- Modify: `packages/three-engine/src/settings/SceneSettingsSystem.ts`
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/RuntimeThreeEngine.ts`
- Create: `packages/three-engine/tests/decoderPaths.test.ts`
- Modify: `packages/three-engine/tests/SceneSettingsSystem.test.ts`
- Create: `apps/editor-web/public/decoders/draco/.gitkeep`
- Create: `apps/editor-web/public/decoders/basis/.gitkeep`
- Create: `apps/runtime-web/public/decoders/draco/.gitkeep`
- Create: `apps/runtime-web/public/decoders/basis/.gitkeep`

**Interfaces:**
- Build hook copies from installed `three/examples/jsm/libs/draco` and `three/examples/jsm/libs/basis` into both web app public roots。
- `SceneSettingsSystem.applyEnvironment(assetId, resolver, generation)` loads RGBE/HDR, runs PMREM, atomically swaps `scene.environment` and disposes old texture/render target。

- [ ] **Step 1: 写 decoder 完整性与 HDR 代次失败测试**

断言构建前脚本复制 `draco_decoder.js`、`draco_wasm_wrapper.js`、`draco_decoder.wasm`、`basis_transcoder.js`、`basis_transcoder.wasm`；连续切换 environment 时迟到 HDR 被 dispose，只有最新 PMREM texture 留在 scene.environment；null 会清除环境。

- [ ] **Step 2: 实现固定 decoder 路径**

Loader 继续使用 r183 `three/addons/...`，Draco path 为 `/decoders/draco/`，KTX2 transcoder path 为 `/decoders/basis/`；copy 脚本按文件白名单复制，缺文件时构建立即失败而不是运行时 404。

- [ ] **Step 3: 实现 HDR/PMREM 生命周期**

RGBELoader 通过 AssetResolver 取得 HDR URL；PMREMGenerator 由 Engine 生命周期持有；新环境成功前保留旧环境，切换成功后才释放旧 texture/renderTarget；dispose 与加载代次都阻止晚到回调回写 Scene。

- [ ] **Step 4: 验证并提交**

Run: `pnpm copy:three-decoders && pnpm --filter @digital-twin/three-engine test && pnpm build`

```bash
git add scripts package.json packages/three-engine apps/editor-web/public apps/runtime-web/public pnpm-lock.yaml
git commit -m "🐎 perf(资源加载): 配置Decoder与HDR环境生命周期"
```

---

### Task 9: 用真实 Chromium 验收预览、WebSocket 与发布闭环

**Files:**
- Create: `tests/e2e/runtime-publication.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`

**Interfaces:**
- Verifies: 创建项目 → 上传 GLB → 添加多模型 → 配置 click 与 Socket 任务 → 保存 → preview → WebSocket 更新 → 发布 → runtime → 再发布原子替换。

- [ ] **Step 1: 写完整失败 E2E**

测试内启动仅绑定 `127.0.0.1` 随机端口的 WebSocket fixture；上传真实最小 GLB，添加两个实例；通过编辑器配置 click 显隐和 `device-position` Socket task；preview 连接 fixture 后接收消息并报告 `data-last-task-code=device-position`；点击节点执行声明式 interaction。

- [ ] **Step 2: 验证无版本原子发布**

首次发布打开 `/runtime/:publicationId` 并断言业务对象数、交互和 Socket 生效；修改场景后让 MinIO 写入故障 fixture 触发一次发布失败，旧 runtime 仍能加载；恢复后再次发布，publicationId 不变、contentHash 变化、数据库仍只有一行 Publication、旧内部 release 前缀被清理。

- [ ] **Step 3: 验证运行时构建边界**

检查 runtime 产物不包含 `TransformControls`、`CommandHistory`、Element Plus 样式和编辑器中文面板文案；记录 editor/runtime gzip 大小，runtime JS 预算先设为 1.2 MB 未压缩，超出即失败并通过 route/manualChunks 拆分。

- [ ] **Step 4: 执行完整验证**

Run:

```bash
pnpm exec playwright test tests/e2e/runtime-publication.spec.ts
pnpm verify
git diff --check
```

Expected: 所有 unit/component/E2E 通过，无 TypeScript、ESLint、Stylelint 或构建错误。

- [ ] **Step 5: 更新说明并提交验收**

README 记录 Node 24 启动、editor/runtime URL、WebSocket 消息格式、预览、发布和 iframe 使用方法，以及 decoder 静态文件来源与复制命令。

```bash
git add tests/e2e playwright.config.ts README.md
git commit -m "✅ tests(运行时发布): 验证交互WebSocket与原子发布"
```

## Completion Gate

1. 场景协议拒绝任意 JavaScript，并能完整表达首期交互、条件、动作、数据源和 Socket 任务。
2. `runtime-core` 可在没有 Vue/Three.js 的情况下测试交互、条件、动作、变量、WebSocket 和销毁行为。
3. `RuntimeThreeEngine` 不创建 TransformControls、编辑选择或辅助网格，且正确释放全部 Three.js 资源。
4. `/preview/:sceneId` 加载当前草稿；`/runtime/:publicationId` 只加载当前 MinIO 发布包。
5. WebSocket 支持自动连接、心跳、指数退避、重连上限、任务映射、模拟消息和诊断日志。
6. 发布失败保持旧线上内容；成功以同一 Publication 指针替换当前内容，不产生用户可见版本列表。
7. 发布包包含强校验 Manifest、Scene JSON 和独立模型资源，运行时不依赖模型库活动文件。
8. 编辑器可配置交互/Socket、打开预览、保存后发布并复制访问地址与 iframe。
9. Draco/Basis 静态资源存在，HDR/PMREM 晚到资源不会污染新场景且能完整释放。
10. 真实 Chromium 完成多模型、交互、WebSocket、失败保护、重复发布和运行时加载闭环。
