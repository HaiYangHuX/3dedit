# Orbit Controls Parity Implementation Plan

**Goal:** 对齐 数字孪生 `4.0.4` 线上编辑器的 OrbitControls 按键映射、缩放速度、观察中心和旋转限制。

**Architecture:** `OrbitControlsProfile` 作为 Three 引擎内部的唯一控制器配置边界；EditorEngine 与 RuntimeThreeEngine 共用同一预设。

**Tech Stack:** Three.js `0.183.0`、TypeScript strict、Vitest、Playwright。

## Global Constraints

- 以线上 `renderScene-OLdlmnPo.js` 为依据，旧 GitHub 源码只用于理解架构。
- 不替换 OrbitControls，不引入额外 RAF 或第三方相机控制库。
- 左键 Pan、中键 Dolly、右键 Rotate，三端操作一致。
- 不开启阻尼；target 为 `(0, 0.5, 0)`；`maxDistance = 200`；垂直旋转上限为 `90°`。
- 新增注释使用中文，只解释非显而易见的源站约束。

### Task 1: 使回归测试捕获当前错误

- [x] 断言左键 Pan、中键 Dolly、右键 Rotate。
- [x] 断言无阻尼、三项速度、target、`maxDistance` 和垂直角限制。
- [x] 运行测试，确认它因当前实现错误开启阻尼而失败。

### Task 2: 修正编辑器与运行时

- [x] 将线上控制参数集中写入 `OrbitControlsProfile`。
- [x] 删除会覆盖固定 `maxDistance` 的动态包围盒逻辑。
- [x] 编辑器、预览与发布端全部开启 Pan。
- [x] 运行窄测试和 Three 引擎 typecheck。

### Task 3: 验证与交付

- [ ] 运行真实 WebGL 编辑器 E2E，检查控制器实例参数。
- [ ] 运行 `CI=1 pnpm verify`。
- [ ] 检查 `git diff --check`、工作区状态并提交中文 Conventional Commit。
