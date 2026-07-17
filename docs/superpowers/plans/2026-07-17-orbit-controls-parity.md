# Orbit Controls Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (inline execution is authorized for this task). Steps use checkbox (`- [ ]`) syntax.

**Goal:** 对齐 ThreeFlowX 源站的 OrbitControls 鼠标拖动、平移、滚轮缩放和模型尺寸限制。

**Architecture:** 新增 `OrbitControlsProfile` 作为 Three 引擎内部控制器配置边界；EditorEngine/RuntimeThreeEngine 仅声明编辑器与运行时的 Pan 策略，并在场景文档节点变化后调用同一包围盒距离限制函数。

**Tech Stack:** Three.js `0.183.0`、TypeScript strict、Vitest。

## Global Constraints

- 不替换 OrbitControls，不引入额外 RAF 或第三方相机控制库。
- 阻尼使用 Three.js 默认 `dampingFactor = 0.05`。
- 核心编辑器和运行时 Pan 均关闭；两者 target 均为原点。源码中的标签预览模板不属于核心编辑器主路径。
- 最大距离参考源站 `包围盒对角线 × 10`，空场景保留当前视距并使用远裁剪面兜底。
- 新增注释使用中文，只说明源站行为和空场景边界。

### Task 1: OrbitControls 配置边界

**Files:**
- Create: `packages/three-engine/src/interaction/OrbitControlsProfile.ts`
- Test: `packages/three-engine/tests/OrbitControlsProfile.test.ts`
- Modify: `packages/three-engine/src/index.ts`

- [ ] 写测试：断言编辑器/运行时 Pan 配置、阻尼、target 原点以及有/无包围盒时的 `maxDistance`。
- [ ] 先运行测试确认缺少模块导致失败。
- [ ] 实现最小配置函数和根节点包围盒距离函数。
- [ ] 运行测试与 Three 引擎 typecheck。

### Task 2: 接入编辑器与运行时

**Files:**
- Modify: `packages/three-engine/src/EditorEngine.ts`
- Modify: `packages/three-engine/src/RuntimeThreeEngine.ts`
- Modify: `packages/three-engine/tests/ViewportCameraSystem.test.ts`

- [ ] 初始化时调用统一配置；编辑器默认相机调整为源站重置相机 `(0, 2, 6)`。
- [ ] 文档加载及节点增删改后更新最大距离。
- [ ] 运行时文档加载后更新最大距离，并保持运行时不可 Pan。
- [ ] 运行既有引擎测试和真实编辑器 E2E。

### Task 3: 验证与交付

- [ ] 运行 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 和 `CI=1 pnpm test:e2e`。
- [ ] 检查 `git diff --check`、工作区状态并提交中文 Conventional Commit。
