# Editor Model Loading Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the requested HUD loading animation over the editor canvas while models added by drag/drop or double-click are being instantiated.

**Architecture:** `EditorWorkspace` owns a pending-model counter around the existing `commands.addAssetNode()` Promise and passes a derived boolean to `EditorCanvas`. `EditorCanvas` remains presentational: it renders an accessible canvas-local overlay using a vendored copy of the requested loading.io SVG. Existing command and Three Engine APIs remain unchanged.

**Tech Stack:** Vue 3 Composition API, TypeScript 5.9, Vitest 4, Vue Test Utils, SCSS, Vite static assets.

## Global Constraints

- Only model additions show this loading state; geometry and light additions remain unchanged.
- Drag/drop and double-click model additions use the same loading lifecycle.
- The overlay text is exactly `模型加载中...`.
- The spinner source is `https://loading.io/assets/mod/spinner/hud/index.svg` and must be stored locally rather than requested at runtime.
- Multiple concurrent model additions keep the overlay visible until all operations settle.
- Success and failure both decrement the pending count; existing `ElMessage.error` behavior remains intact.
- The overlay covers only the central canvas and exposes `role="status"` with `aria-live="polite"`.
- Do not modify the Three Engine public API.

---

### Task 1: Add the presentational canvas loading overlay

**Files:**
- Create: `apps/editor-web/public/loading/hud-spinner.svg`
- Modify: `apps/editor-web/src/components/EditorCanvas.vue`
- Modify: `apps/editor-web/src/styles/editor.scss`
- Test: `apps/editor-web/tests/EditorCanvasBridge.test.ts`

**Interfaces:**
- Consumes: optional Vue prop `modelLoading?: boolean`, defaulting to `false`.
- Produces: `[data-testid="model-loading-overlay"]` inside the canvas, using `/loading/hud-spinner.svg`.

- [ ] **Step 1: Write the failing canvas rendering test**

Add a focused test to `EditorCanvasBridge.test.ts`:

```ts
it('只在模型加载时渲染画布内 HUD 遮罩', async () => {
  const document = createDefaultSceneDocument(
    'project-1',
    'scene-1',
    '主场景',
  );
  const wrapper = mount(EditorCanvas, {
    props: { document, modelLoading: false },
  });
  await flushPromises();

  expect(wrapper.find('[data-testid="model-loading-overlay"]').exists()).toBe(
    false,
  );

  await wrapper.setProps({ modelLoading: true });
  const overlay = wrapper.get('[data-testid="model-loading-overlay"]');
  expect(overlay.attributes('role')).toBe('status');
  expect(overlay.attributes('aria-live')).toBe('polite');
  expect(overlay.text()).toContain('模型加载中...');
  expect(overlay.get('img').attributes('src')).toBe(
    '/loading/hud-spinner.svg',
  );
  expect(overlay.get('img').attributes('aria-hidden')).toBe('true');
});
```

- [ ] **Step 2: Run the test and verify the new behavior is absent**

Run:

```bash
pnpm --filter @digital-twin/editor-web test -- EditorCanvasBridge.test.ts
```

Expected: FAIL because `EditorCanvas` has no `modelLoading` overlay.

- [ ] **Step 3: Vendor the exact spinner asset**

Create the target directory and download the official SVG with headers accepted by loading.io:

```bash
mkdir -p apps/editor-web/public/loading
curl -L --fail --silent --show-error \
  -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0 Safari/537.36' \
  -e 'https://loading.io/' \
  https://loading.io/assets/mod/spinner/hud/index.svg \
  -o apps/editor-web/public/loading/hud-spinner.svg
```

Verify:

```bash
file apps/editor-web/public/loading/hud-spinner.svg
rg -n '<svg|lds-hud' apps/editor-web/public/loading/hud-spinner.svg
```

Expected: `SVG Scalable Vector Graphics image` and matches for both `<svg` and `lds-hud`.

- [ ] **Step 4: Add the prop and overlay markup**

Extend the existing `withDefaults(defineProps(...))` in `EditorCanvas.vue`:

```ts
const props = withDefaults(
  defineProps<{
    document: SceneDocument;
    gridSize?: number | null;
    modelLoading?: boolean;
  }>(),
  { gridSize: 0.5, modelLoading: false },
);
```

Add this markup after `canvas-error` inside `.editor-canvas`:

```vue
<div
  v-if="modelLoading"
  class="editor-model-loading"
  data-testid="model-loading-overlay"
  role="status"
  aria-live="polite"
>
  <img
    class="editor-model-loading__spinner"
    src="/loading/hud-spinner.svg"
    alt=""
    aria-hidden="true"
  />
  <strong>模型加载中...</strong>
</div>
```

- [ ] **Step 5: Add stable canvas-local styling**

Add adjacent to `.editor-canvas` styles in `editor.scss`:

```scss
.editor-model-loading {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  gap: 10px;
  place-content: center;
  justify-items: center;
  color: #e2e8f0;
  font-size: 12px;
  background: rgb(7 10 19 / 72%);
}

.editor-model-loading__spinner {
  display: block;
  width: 80px;
  height: 80px;
}
```

- [ ] **Step 6: Run the focused test and commit**

Run:

```bash
pnpm --filter @digital-twin/editor-web test -- EditorCanvasBridge.test.ts
```

Expected: PASS.

Commit only Task 1 files:

```bash
git add apps/editor-web/public/loading/hud-spinner.svg \
  apps/editor-web/src/components/EditorCanvas.vue \
  apps/editor-web/src/styles/editor.scss \
  apps/editor-web/tests/EditorCanvasBridge.test.ts
git commit -m '🌷 UI(编辑器): 新增模型加载画布遮罩'
```

---

### Task 2: Track model additions across both entry points

**Files:**
- Modify: `apps/editor-web/src/views/EditorWorkspace.vue`
- Test: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- Consumes: `commands.addAssetNode(asset, position): Promise<SceneNode | void>` and `EditorCanvas.modelLoading: boolean` from Task 1.
- Produces: `addModelAsset(asset, position): Promise<void>` and a derived `modelLoading` boolean backed by a non-negative pending count.

- [ ] **Step 1: Add deferred-Promise test support**

Add this helper near the test mocks in `EditorWorkspace.test.ts`:

```ts
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
```

Update `beforeEach` so per-test implementations do not leak after `vi.clearAllMocks()`:

```ts
beforeEach(() => {
  vi.clearAllMocks();
  commandMocks.addAssetNode.mockResolvedValue(undefined);
});
```

- [ ] **Step 2: Write failing success and concurrent loading tests**

Add a test that mounts `EditorWorkspace` with an `EditorCanvas` stub exposing the loading prop:

```ts
it('模型添加完成前显示 loading，并等待所有并发操作结束', async () => {
  const first = deferred<void>();
  const second = deferred<void>();
  commandMocks.addAssetNode
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  const wrapper = mount(EditorWorkspace, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      stubs: {
        EditorCanvas: {
          name: 'EditorCanvas',
          props: ['document', 'modelLoading'],
          template:
            '<div data-testid="editor-canvas" :data-model-loading="String(modelLoading)" />',
        },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
  const canvas = wrapper.findComponent({ name: 'EditorCanvas' });
  const payload = {
    kind: 'asset',
    assetId: 'asset-1',
    name: '水泵',
    format: 'glb',
    position: [1, 0, 2],
  } as const;

  canvas.vm.$emit('scene-drop', payload);
  canvas.vm.$emit('scene-drop', { ...payload, assetId: 'asset-2' });
  await wrapper.vm.$nextTick();
  expect(canvas.attributes('data-model-loading')).toBe('true');

  first.resolve();
  await flushPromises();
  expect(canvas.attributes('data-model-loading')).toBe('true');

  second.resolve();
  await flushPromises();
  expect(canvas.attributes('data-model-loading')).toBe('false');
});
```

- [ ] **Step 3: Write the failing error and non-model tests**

Import `ElMessage` alongside `ElMessageBox`, then add:

```ts
it('模型添加失败后关闭 loading 并沿用错误提示', async () => {
  const operation = deferred<void>();
  commandMocks.addAssetNode.mockImplementationOnce(() => operation.promise);
  const errorSpy = vi.spyOn(ElMessage, 'error').mockImplementation(() => ({}) as never);
  const wrapper = mount(EditorWorkspace, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      stubs: {
        EditorCanvas: {
          name: 'EditorCanvas',
          props: ['document', 'modelLoading'],
          template:
            '<div data-testid="editor-canvas" :data-model-loading="String(modelLoading)" />',
        },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
  const canvas = wrapper.findComponent({ name: 'EditorCanvas' });

  canvas.vm.$emit('scene-drop', {
    kind: 'asset',
    assetId: 'asset-1',
    name: '水泵',
    format: 'glb',
    position: [1, 0, 2],
  });
  await wrapper.vm.$nextTick();
  expect(canvas.attributes('data-model-loading')).toBe('true');

  operation.reject(new Error('模型解析失败'));
  await flushPromises();
  expect(canvas.attributes('data-model-loading')).toBe('false');
  expect(errorSpy).toHaveBeenCalledWith('模型解析失败');
  errorSpy.mockRestore();
});
```

In the existing unified `scene-drop` test, change the canvas stub to expose the prop:

```ts
EditorCanvas: {
  name: 'EditorCanvas',
  props: ['document', 'modelLoading'],
  template:
    '<div data-testid="editor-canvas" :data-model-loading="String(modelLoading)" />',
},
```

After emitting geometry and light, but before emitting the asset payload, flush Vue updates and assert neither operation starts model loading:

```ts
await wrapper.vm.$nextTick();
expect(canvas.attributes('data-model-loading')).toBe('false');
```

- [ ] **Step 4: Run the tests and verify the lifecycle is absent**

Run:

```bash
pnpm --filter @digital-twin/editor-web test -- EditorWorkspace.test.ts
```

Expected: FAIL because `modelLoading` is not passed and model operations are not counted.

- [ ] **Step 5: Implement one shared model addition lifecycle**

Add state near other workspace refs:

```ts
const pendingModelAdditions = ref(0);
const modelLoading = computed(() => pendingModelAdditions.value > 0);
```

Add the shared wrapper before `activateAsset`:

```ts
async function addModelAsset(
  asset: Pick<Asset, 'id' | 'name' | 'format'>,
  position: [number, number, number],
): Promise<void> {
  pendingModelAdditions.value += 1;
  try {
    await commands.addAssetNode(asset, position);
  } finally {
    // Each request owns one count so overlapping model loads cannot hide each other.
    pendingModelAdditions.value = Math.max(0, pendingModelAdditions.value - 1);
  }
}
```

Route both model entry points through it while preserving their existing error fallbacks:

```ts
function activateAsset(asset: Asset): void {
  void addModelAsset(asset, [0, 0, 0]).catch((reason) =>
    showEditorError(reason, '添加模型失败'),
  );
}
```

```ts
if (payload.kind === 'asset') {
  void addModelAsset(
    {
      id: payload.assetId,
      name: payload.name,
      format: payload.format,
    },
    payload.position,
  ).catch((reason) => showEditorError(reason, '添加模型失败'));
  return;
}
```

Pass the state to the real canvas:

```vue
<EditorCanvas
  ref="canvas"
  :document="document"
  :model-loading="modelLoading"
```

- [ ] **Step 6: Add a double-click entry-point assertion**

Add `import type { Asset } from '@digital-twin/api-contracts';` to the test, then add this test to protect `AssetLibraryPanel @activate="activateAsset"` from diverging from drag/drop behavior:

```ts
it('双击模型卡复用相同的 loading 生命周期', async () => {
  const operation = deferred<void>();
  commandMocks.addAssetNode.mockImplementationOnce(() => operation.promise);
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const assetStore = useAssetStore(pinia);
  const model: Asset = {
    id: 'asset-1',
    name: '水泵',
    kind: 'model',
    format: 'glb',
    status: 'ready',
    category: '设备',
    tags: [],
    favorite: false,
    sourceHash: 'a'.repeat(64),
    metadata: {},
    error: null,
    retryCount: 0,
    thumbnailUrl: null,
    sourceSize: 1024,
    referenceCount: 0,
    createdAt: '2026-07-16T08:00:00.000Z',
    updatedAt: '2026-07-16T08:00:00.000Z',
  };
  assetStore.assets = [model];
  const wrapper = mount(EditorWorkspace, {
    global: {
      plugins: [pinia],
      stubs: {
        EditorCanvas: {
          name: 'EditorCanvas',
          props: ['document', 'modelLoading'],
          template:
            '<div data-testid="editor-canvas" :data-model-loading="String(modelLoading)" />',
        },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
  const canvas = wrapper.findComponent({ name: 'EditorCanvas' });

  await wrapper.get('[data-asset-id="asset-1"]').trigger('dblclick');
  expect(canvas.attributes('data-model-loading')).toBe('true');
  expect(commandMocks.addAssetNode).toHaveBeenCalledWith(model, [0, 0, 0]);

  operation.resolve();
  await flushPromises();
  expect(canvas.attributes('data-model-loading')).toBe('false');
});
```

- [ ] **Step 7: Run the focused tests and commit**

Run:

```bash
pnpm --filter @digital-twin/editor-web test -- EditorWorkspace.test.ts EditorCanvasBridge.test.ts
```

Expected: PASS.

Commit only Task 2 files:

```bash
git add apps/editor-web/src/views/EditorWorkspace.vue \
  apps/editor-web/tests/EditorWorkspace.test.ts
git commit -m '💥 feat(编辑器): 接入模型添加加载状态'
```

---

### Task 3: Verify behavior and visual integration

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the local spinner, `modelLoading` prop, and shared addition lifecycle from Tasks 1-2.
- Produces: test, type, build, and browser evidence that the feature works without regressions.

- [ ] **Step 1: Run editor validation**

Run:

```bash
pnpm --filter @digital-twin/editor-web test
pnpm --filter @digital-twin/editor-web typecheck
pnpm --filter @digital-twin/editor-web build
pnpm exec prettier --check \
  apps/editor-web/src/components/EditorCanvas.vue \
  apps/editor-web/src/views/EditorWorkspace.vue \
  apps/editor-web/src/styles/editor.scss \
  apps/editor-web/tests/EditorCanvasBridge.test.ts \
  apps/editor-web/tests/EditorWorkspace.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 2: Start the project and inspect the editor in a browser**

Run `./start-all.command`, open `http://127.0.0.1:5173`, navigate to an editor scene containing a ready model, and throttle the model request in browser DevTools if it completes too quickly.

Verify:

- Dragging a model into the viewport shows the HUD centered over only the canvas.
- Double-clicking a model shows the same HUD.
- The spinner is animated and the text is readable.
- Side panels and toolbar do not move or overlap.
- The overlay disappears when the model becomes selectable.
- A failed model request removes the overlay and shows the existing error toast.

- [ ] **Step 3: Review the final diff**

Run:

```bash
git diff HEAD~2 --check
git diff HEAD~2 --stat
git status --short
```

Expected: no whitespace errors; only intended feature files plus pre-existing unrelated workspace changes are listed.
