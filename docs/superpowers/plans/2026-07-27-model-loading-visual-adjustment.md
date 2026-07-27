# 模型 Loading 视觉调整实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除模型 Loading HUD 的浅绿色背景，并将画布内显示尺寸从 `80 × 80px` 放大到 `96 × 96px`。

**Architecture:** 保持现有 `EditorCanvas` 组件和加载状态数据流不变，仅调整 HUD 静态资源的根节点样式以及全局编辑器样式中的图片尺寸。新增一个静态资源契约测试，直接验证 SVG 透明背景和 SCSS 尺寸，避免视觉配置回归。

**Tech Stack:** Vue 3、SCSS、SVG、Vitest、Node.js 文件 API、Vite

## Global Constraints

- HUD SVG 背景必须完全透明。
- HUD 在编辑器画布中的显示尺寸必须为 `96 × 96px`。
- 全画布深色遮罩、居中布局、提示文字和加载状态逻辑保持不变。
- 不修改 Runtime 页面及其他 Loading 组件。

---

### Task 1: 调整模型 Loading 视觉

**Files:**
- Create: `apps/editor-web/tests/ModelLoadingVisual.test.ts`
- Modify: `apps/editor-web/public/loading/hud-spinner.svg:1`
- Modify: `apps/editor-web/src/styles/editor.scss:1129-1133`

**Interfaces:**
- Consumes: `EditorCanvas.vue` 使用的 `/loading/hud-spinner.svg` 和 `.editor-model-loading__spinner` 样式类。
- Produces: 透明背景的 HUD 静态资源，以及固定为 `96 × 96px` 的画布显示契约。

- [ ] **Step 1: 编写失败的视觉契约测试**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const editorRoot = fileURLToPath(new URL('../', import.meta.url));

describe('模型 Loading 视觉资源', () => {
  it('HUD SVG 根节点不声明背景色', () => {
    const svg = readFileSync(`${editorRoot}/public/loading/hud-spinner.svg`, 'utf8');
    const rootTag = svg.match(/<svg\b[^>]*>/)?.[0] ?? '';

    expect(rootTag).not.toMatch(/background\s*:/i);
  });

  it('画布中的 HUD 显示为 96px 正方形', () => {
    const styles = readFileSync(`${editorRoot}/src/styles/editor.scss`, 'utf8');
    const spinnerRule = styles.match(/\.editor-model-loading__spinner\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(spinnerRule).toMatch(/width:\s*96px;/);
    expect(spinnerRule).toMatch(/height:\s*96px;/);
  });
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `pnpm --filter @digital-twin/editor-web test -- ModelLoadingVisual.test.ts`

Expected: 两个用例失败；SVG 根节点仍包含 `background`，SCSS 仍为 `80px`。

- [ ] **Step 3: 实现最小视觉调整**

将 SVG 根节点从：

```svg
<svg width="80px" height="80px" ... style="background: rgb(30, 44, 36);">
```

调整为不包含 `style="background: ..."` 的根节点，并将 SCSS 调整为：

```scss
.editor-model-loading__spinner {
  display: block;
  width: 96px;
  height: 96px;
}
```

- [ ] **Step 4: 运行目标测试并确认通过**

Run: `pnpm --filter @digital-twin/editor-web test -- ModelLoadingVisual.test.ts`

Expected: `2 passed`。

- [ ] **Step 5: 运行编辑器完整验证**

Run:

```bash
pnpm --filter @digital-twin/editor-web test
pnpm --filter @digital-twin/editor-web typecheck
pnpm --filter @digital-twin/editor-web build
```

Expected: 所有测试、类型检查和生产构建退出码均为 `0`。

- [ ] **Step 6: 提交视觉调整**

```bash
git add apps/editor-web/tests/ModelLoadingVisual.test.ts \
  apps/editor-web/public/loading/hud-spinner.svg \
  apps/editor-web/src/styles/editor.scss
git commit -m "🌷 UI(编辑器): 优化模型加载动画展示"
```

### Task 2: 发布并验证线上版本

**Files:**
- Deploy source: 当前 `main` 分支 `HEAD` 的 Git 归档。
- Server release: `/opt/three3d/releases/<timestamp>-<commit>`
- Server static: `/opt/three3d/static`

**Interfaces:**
- Consumes: 已验证并提交的编辑器前端代码。
- Produces: 域名 `http://three3d.cc.cd/` 下的新编辑器静态资源，以及可回滚的上一版静态目录和镜像标签。

- [ ] **Step 1: 归档并上传已提交版本**

Run: `git archive HEAD | gzip > /tmp/three3d-<commit>.tar.gz`，随后上传并校验 SHA-256。

Expected: 本地与服务器归档 SHA-256 一致。

- [ ] **Step 2: 在独立 release 中构建候选镜像**

Run: 使用现有 `/opt/three3d/app/Dockerfile.deploy` 构建 `three3d-app:<release>`。

Expected: Docker build 退出码为 `0`，且镜像可被 `docker image inspect` 查询。

- [ ] **Step 3: 提取并校验静态资源**

Run: 从候选镜像复制 Editor 与 Runtime 的 `dist`，检查 `index.html` 和 `loading/hud-spinner.svg` 存在。

Expected: HUD SVG 根节点无 `background`，构建后的 Editor CSS 包含 `96px` 尺寸规则。

- [ ] **Step 4: 保留回滚并切换静态目录**

Run: 备份 `/opt/three3d/static` 和旧 `latest` 镜像标签，切换新静态目录、release symlink 和镜像标签，随后执行 `nginx -t` 与 reload。

Expected: Nginx 配置检查成功，API、Worker、PostgreSQL、Redis 和 MinIO 容器不重启且保持运行。

- [ ] **Step 5: 从外部验证线上资源**

Run: 对首页、Runtime、HUD SVG、编辑器 JS/CSS 和 `/api/health` 执行 HTTP 检查。

Expected: 全部返回 `200`，健康接口返回 `status: ok`，线上 HUD SVG 不含背景声明。
