# 相机漫游表面点位投影修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让相机漫游点位优先落在当前可见业务模型的朝上表面，并让旧地面路径和新高台路径都以正确相对眼高播放。

**Architecture:** `EditorEngine` 通过惰性回调向 `CameraRoamingSystem` 暴露当前 `SceneDocumentSystem.root`；漫游系统只对该根节点执行递归射线检测，筛选可见、非辅助且世界法线朝上的最近交点，未命中时回退 `Y=0`。路径点继续保存表面上方 `0.55`，播放相机在路径点基础上增加 `1.45`，因此旧数据无需迁移。

**Tech Stack:** TypeScript 5.9、Three.js 0.183、Vitest 4.1、pnpm 10.12、Vue 编辑器宿主、Codex 内置浏览器。

## Global Constraints

- 路径 Schema 保持 `[x, y, z]`，不增加字段、不迁移历史数据。
- 合格表面的世界法线阈值固定为 `normal.y >= 0.5`。
- 路径点垂直间距固定为 `0.55`；播放相机相对路径点增加 `1.45`，旧点 `Y=0.55` 仍播放在 `Y=2`。
- Ctrl/Command 点击、`250ms/5px` 点击阈值、速度 `4`、最短分段 `400ms` 和末段转向插值保持不变。
- 不引入导航网格、碰撞、寻路、依赖升级或无关重构。
- 浏览器验收必须使用 Codex 内置浏览器。
- 工作区已有 `.agents/`、`SceneSettingsInspector.vue` 和 `SceneSettingsInspector.test.ts` 改动属于用户；提交时必须使用显式路径和 `git commit --only`，不得覆盖或带入这些改动。

## File Structure

- Modify: `packages/three-engine/src/camera/CameraRoamingSystem.ts` — 表面投影筛选、地面回退常量与相对播放高度。
- Modify: `packages/three-engine/src/EditorEngine.ts` — 向漫游系统提供当前业务文档根节点的惰性回调。
- Modify: `packages/three-engine/tests/CameraRoamingSystem.test.ts` — 使用真实 Three.js 射线覆盖高台、过滤、回退、根节点替换和播放兼容。
- No schema/UI files change; browser验收复用现有相机漫游面板。

---

### Task 1: 业务表面射线投影与地面回退

**Files:**
- Modify: `packages/three-engine/tests/CameraRoamingSystem.test.ts:1-180`
- Modify: `packages/three-engine/src/camera/CameraRoamingSystem.ts:25-62,82-90,370-389`
- Modify: `packages/three-engine/src/EditorEngine.ts:261-267`

**Interfaces:**
- Consumes: `SceneDocumentSystem.root: Object3D`、画布 `getBoundingClientRect()`、Three.js `Raycaster` 交点。
- Produces: `CameraRoamingSystemOptions.getSurfaceRoot?(): Object3D | undefined`；每次有效点击动态解析当前业务根节点。
- Produces: `projectPoint(clientX, clientY): Vector3 | undefined` 返回合格表面上方 `0.55` 的点，或原地面回退点。

- [ ] **Step 1: 写真实射线失败测试**

把测试文件的 Three.js 导入扩展为以下内容，并在现有 `createHarness()` 后加入表面测试辅助函数：

```ts
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  type Object3D,
} from 'three';

function addHorizontalSurface(parent: Object3D, y: number): Mesh {
  const surface = new Mesh(
    new PlaneGeometry(20, 20),
    new MeshBasicMaterial({ side: DoubleSide }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = y;
  parent.add(surface);
  return surface;
}

function createSurfaceHarness() {
  const scene = new Scene();
  const root = new Group();
  scene.add(root);
  let surfaceRoot: Object3D | undefined = root;
  const camera = new PerspectiveCamera(60, 2, 0.1, 100);
  camera.position.set(0, 8, 8);
  camera.lookAt(0, 4, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const canvas = new CanvasStub();
  const keyboardTarget = new EventTarget();
  const onPathCreated = vi.fn();
  const system = new CameraRoamingSystem({
    scene,
    camera,
    canvas: canvas as unknown as HTMLElement,
    controls: { enabled: true },
    keyboardTarget,
    getSurfaceRoot: () => surfaceRoot,
    onPathCreated,
    invalidate: vi.fn(),
  });

  return {
    scene,
    root,
    system,
    setSurfaceRoot(root: Object3D | undefined) {
      surfaceRoot = root;
    },
    drawCenterPoints(): Array<[number, number, number]> {
      system.startDrawing();
      keyboardTarget.dispatchEvent(keyboardEvent('keydown', 'Control'));
      for (let index = 0; index < 2; index += 1) {
        canvas.dispatchEvent(pointerEvent('pointerdown', 300, 150));
        canvas.dispatchEvent(pointerEvent('pointerup', 300, 150));
      }
      keyboardTarget.dispatchEvent(keyboardEvent('keyup', 'Control'));
      return onPathCreated.mock.calls[0]![0];
    },
  };
}
```

在现有 `describe('CameraRoamingSystem', ...)` 中加入以下测试：

```ts
it('按点击时的业务根节点选择最近朝上表面并增加 0.55 高度', () => {
  const harness = createSurfaceHarness();
  addHorizontalSurface(harness.root, 6);
  const replacementRoot = new Group();
  harness.scene.add(replacementRoot);
  addHorizontalSurface(replacementRoot, 2);
  addHorizontalSurface(replacementRoot, 4);
  harness.setSurfaceRoot(replacementRoot);

  const points = harness.drawCenterPoints();

  expect(points).toHaveLength(2);
  expect(points[0]![0]).toBeCloseTo(0);
  expect(points[0]![1]).toBeCloseTo(4.55);
  expect(points[0]![2]).toBeCloseTo(0);
  harness.system.dispose();
});

it('跳过隐藏与编辑器辅助表面', () => {
  const harness = createSurfaceHarness();
  const hidden = new Group();
  hidden.visible = false;
  addHorizontalSurface(hidden, 6);
  harness.root.add(hidden);
  const helper = new Group();
  helper.userData.editorHelper = true;
  addHorizontalSurface(helper, 5);
  harness.root.add(helper);
  addHorizontalSurface(harness.root, 3);

  const points = harness.drawCenterPoints();

  expect(points[0]![1]).toBeCloseTo(3.55);
  harness.system.dispose();
});

it('墙面或没有合格业务表面时回退到世界地面', () => {
  const harness = createSurfaceHarness();
  const wall = new Mesh(
    new PlaneGeometry(20, 20),
    new MeshBasicMaterial({ side: DoubleSide }),
  );
  wall.position.y = 4;
  harness.root.add(wall);

  const points = harness.drawCenterPoints();

  expect(points[0]![1]).toBeCloseTo(0.55);
  harness.system.dispose();
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
pnpm --filter @digital-twin/three-engine exec vitest run tests/CameraRoamingSystem.test.ts
```

Expected: FAIL；新增高台断言实际得到 `0.55`，证明当前实现仍固定投影到 `Y=0`。

- [ ] **Step 3: 最小实现业务表面筛选**

在 `CameraRoamingSystem.ts` 导入 `Matrix3` 和 `type Intersection`，增加常量、选项与复用字段：

```ts
const PATH_POINT_CLEARANCE = 0.55;
const MIN_WALKABLE_NORMAL_Y = 0.5;

export interface CameraRoamingSystemOptions {
  scene: Scene;
  camera: PerspectiveCamera;
  canvas: HTMLElement;
  controls: CameraRoamingControls;
  invalidate(): void;
  getSurfaceRoot?(): Object3D | undefined;
  onStateChange?(state: CameraRoamingState): void;
  onPathCreated?(pathPoints: Array<[number, number, number]>): void;
  keyboardTarget?: EventTarget;
  now?(): number;
  projectPoint?(clientX: number, clientY: number): Vector3 | undefined;
}

private readonly normalMatrix = new Matrix3();
private readonly surfaceNormal = new Vector3();
```

把 `projectPoint` 替换为下列行为，并增加两个私有方法：

```ts
private projectPoint(clientX: number, clientY: number): Vector3 | undefined {
  const injected = this.options.projectPoint?.(clientX, clientY);
  if (injected) return injected.clone();
  const rect = this.options.canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  this.pointer.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  this.raycaster.setFromCamera(this.pointer, this.options.camera);
  const maxDistance = Math.max(this.options.camera.position.length() * 2, 50);
  const surfaceRoot = this.options.getSurfaceRoot?.();
  const surfacePoint = surfaceRoot
    ? this.projectOntoSurface(surfaceRoot, maxDistance)
    : undefined;
  if (surfacePoint) return surfacePoint;

  const result = new Vector3();
  if (!this.raycaster.ray.intersectPlane(this.groundPlane, result)) {
    return undefined;
  }
  if (result.distanceTo(this.options.camera.position) > maxDistance) {
    return undefined;
  }
  result.y = PATH_POINT_CLEARANCE;
  return result;
}

private projectOntoSurface(
  surfaceRoot: Object3D,
  maxDistance: number,
): Vector3 | undefined {
  surfaceRoot.updateWorldMatrix(true, true);
  for (const intersection of this.raycaster.intersectObject(surfaceRoot, true)) {
    if (intersection.distance > maxDistance) break;
    if (!this.isWalkableIntersection(intersection, surfaceRoot)) continue;
    const point = intersection.point.clone();
    point.y += PATH_POINT_CLEARANCE;
    return point;
  }
  return undefined;
}

private isWalkableIntersection(
  intersection: Intersection<Object3D>,
  surfaceRoot: Object3D,
): boolean {
  let reachedRoot = false;
  for (
    let object: Object3D | null = intersection.object;
    object;
    object = object.parent
  ) {
    if (
      !object.visible ||
      object.userData.editorHelper === true ||
      object.userData.isEditorHelper === true
    ) {
      return false;
    }
    if (object === surfaceRoot) {
      reachedRoot = true;
      break;
    }
  }
  const faceNormal = intersection.face?.normal;
  if (!reachedRoot || !faceNormal) return false;
  this.normalMatrix.getNormalMatrix(intersection.object.matrixWorld);
  this.surfaceNormal.copy(faceNormal).applyNormalMatrix(this.normalMatrix);
  return this.surfaceNormal.y >= MIN_WALKABLE_NORMAL_Y;
}
```

- [ ] **Step 4: 运行目标测试并确认 GREEN**

Run:

```powershell
pnpm --filter @digital-twin/three-engine exec vitest run tests/CameraRoamingSystem.test.ts
```

Expected: PASS；高台、隐藏/辅助过滤、墙面回退与全部既有漫游测试通过。

- [ ] **Step 5: 装配当前业务根节点回调**

在 `EditorEngine` 创建漫游系统的 `controls: this.controls,` 后插入惰性回调；不要向只播放路径的 `RuntimeThreeEngine` 增加无用配置：

```ts
getSurfaceRoot: () => this.documentSystem?.root,
```

- [ ] **Step 6: 格式化、类型检查并复跑目标测试**

Run:

```powershell
pnpm exec prettier --write packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/src/EditorEngine.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
pnpm --filter @digital-twin/three-engine typecheck
pnpm --filter @digital-twin/three-engine exec vitest run tests/CameraRoamingSystem.test.ts
```

Expected: Prettier completes；typecheck 退出码 `0`；测试文件全部 PASS。

- [ ] **Step 7: 只提交 Task 1 文件**

```powershell
git add -- packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/src/EditorEngine.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
git commit --only -m "fix: 修复漫游点位表面投影" -- packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/src/EditorEngine.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
```

Expected: 提交只包含上述三个文件；用户已有暂存改动仍保留在索引中。

---

### Task 2: 相对路径表面的播放眼高

**Files:**
- Modify: `packages/three-engine/tests/CameraRoamingSystem.test.ts:84-180`
- Modify: `packages/three-engine/src/camera/CameraRoamingSystem.ts:25-36,130-138`

**Interfaces:**
- Consumes: `CameraRoamingPath.pathPoints: Array<[number, number, number]>`，其中 `y` 为表面上方 `0.55` 的路径点高度。
- Produces: 播放点 `new Vector3(x, y + CAMERA_OFFSET_FROM_PATH_POINT, z)`，`CAMERA_OFFSET_FROM_PATH_POINT = 1.45`。

- [ ] **Step 1: 写高台播放失败测试**

在既有“眼高 2”播放测试后加入：

```ts
it('按路径点高度增加 1.45 播放高台路径', () => {
  const harness = createHarness();
  const elevatedPath: CameraRoamingPath = {
    ...path,
    id: 'elevated-path',
    pathPoints: [
      [0, 4.55, 0],
      [4, 4.55, 0],
    ],
  };

  expect(harness.system.preview(elevatedPath)).toBe(true);
  expect(harness.camera.position.toArray()).toEqual([0, 6, 0]);
  harness.system.update(2);
  expect(harness.camera.position.toArray()).toEqual([4, 6, 0]);
  harness.system.dispose();
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
pnpm --filter @digital-twin/three-engine exec vitest run tests/CameraRoamingSystem.test.ts -t "按路径点高度增加"
```

Expected: FAIL；当前相机初始位置仍为 `[0, 2, 0]`。

- [ ] **Step 3: 最小实现相对眼高**

把固定相机高度常量改成相对路径点偏移，并保留 Task 1 的点位间距常量：

```ts
const PATH_POINT_CLEARANCE = 0.55;
const CAMERA_EYE_HEIGHT = 2;
const CAMERA_OFFSET_FROM_PATH_POINT =
  CAMERA_EYE_HEIGHT - PATH_POINT_CLEARANCE;
```

把 `preview()` 的映射改为保留路径 `y`：

```ts
const points = path.pathPoints.map(
  ([x, y, z]) => new Vector3(x, y + CAMERA_OFFSET_FROM_PATH_POINT, z),
);
```

- [ ] **Step 4: 运行新旧播放测试并确认 GREEN**

Run:

```powershell
pnpm --filter @digital-twin/three-engine exec vitest run tests/CameraRoamingSystem.test.ts
```

Expected: PASS；旧路径仍断言 `[0, 2, 0] → [4, 2, 4]`，高台路径断言 `[0, 6, 0] → [4, 6, 0]`。

- [ ] **Step 5: 格式化、类型检查并只提交 Task 2 文件**

```powershell
pnpm exec prettier --write packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
pnpm --filter @digital-twin/three-engine typecheck
git add -- packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
git commit --only -m "fix: 保持漫游相机相对路径眼高" -- packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
```

Expected: typecheck 退出码 `0`；提交只包含相机漫游系统与对应测试。

---

### Task 3: 回归验证、内置浏览器验收与临时环境清理

**Files:**
- Verify only: `packages/three-engine/src/camera/CameraRoamingSystem.ts`
- Verify only: `packages/three-engine/src/EditorEngine.ts`
- Verify only: `packages/three-engine/tests/CameraRoamingSystem.test.ts`
- Browser fixture: project `6fd2dc8e-9af6-4500-a525-13fb63a26be8` / scene `13b07b94-520c-427c-a15b-fccaf6e094fc`

**Interfaces:**
- Consumes: 本地 editor/API 测试环境与 `codex-platform` 高台模型（位置 `[0,2,0]`、缩放 `[4,4,4]`）。
- Produces: 单测、类型和 lint 证据；Codex 内置浏览器的地面/高台/墙面/播放验收结果；精确清理临时数据与进程。

- [ ] **Step 1: 运行相关静态检查与完整 Three Engine 测试**

```powershell
pnpm exec prettier --check packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/src/EditorEngine.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
pnpm exec eslint packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/src/EditorEngine.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
pnpm --filter @digital-twin/three-engine typecheck
pnpm --filter @digital-twin/three-engine test
pnpm --filter @digital-twin/editor-web typecheck
```

Expected: 所有命令退出码 `0`；Three Engine 全部测试 PASS。

- [ ] **Step 2: 用 Codex 内置浏览器执行真实交互验收**

先读取 `browser:control-in-app-browser` 技能并使用其浏览器工具，不使用 Playwright 或用户 Chrome。打开当前本地同源编辑器测试地址，进入上述 project/scene，完成：

1. 选择 Camera → 相机漫游 → 添加漫游路径。
2. Ctrl/Command 点击空白网格两点，确认点位仍贴合地面点击位置。
3. Ctrl/Command 点击高台顶部至少两点，确认标记与连线位于高台顶部。
4. 点击高台侧墙，确认点位不吸附墙面而回退地面。
5. 保存并播放高台路径，确认相机始终在高台上方且不进入模型。
6. 播放已有地面路径，确认相机眼高仍为原有效果。

Expected: 六项均通过；若失败，保留浏览器状态和截图，回到对应 RED 测试后再修复，不以手工偏移掩盖问题。

- [ ] **Step 3: 检查修复差异和用户改动隔离**

```powershell
git diff HEAD~2 -- packages/three-engine/src/camera/CameraRoamingSystem.ts packages/three-engine/src/EditorEngine.ts packages/three-engine/tests/CameraRoamingSystem.test.ts
git status --short
```

Expected: 生产差异仅包含表面投影、根节点回调和相对眼高；用户原有 `.agents/`、`SceneSettingsInspector.vue`、`SceneSettingsInspector.test.ts` 改动仍存在且未被修复提交包含。

- [ ] **Step 4: 精确清理本任务创建的临时资源**

先只读确认项目 ID、场景 ID和进程命令行，再删除临时 project `6fd2dc8e-9af6-4500-a525-13fb63a26be8`（其 scene 会随项目清理），并仅停止以下临时进程：API 子进程 PID `23928`、Vite PID `46032`、同源代理 Vite PID `8972`。若 PID 已不存在或命令行不匹配，则不对该 PID 执行停止操作；不得停止已有 `3100/5173/5174` 服务。

Expected: 临时项目不再出现在项目列表；只关闭本任务创建且身份匹配的 `5175/5273/5373` 临时服务；用户既有服务继续运行。

- [ ] **Step 5: 汇总证据**

记录目标测试数、完整 Three Engine 测试数、类型/lint 结果、浏览器六项验收结果、两个修复提交哈希和临时资源清理结果。只有所有必需检查均通过时才声明修复完成。
