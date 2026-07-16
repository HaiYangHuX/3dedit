# 平台工程基础与 Three.js 内核骨架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可运行、可测试、可容器化的数字孪生 Monorepo，并完成场景协议、命令历史、Three.js r183 生命周期、编辑器壳、运行时壳、API 与 Worker 的第一条纵向链路。

**Architecture:** 使用 pnpm workspace 管理四个应用和六个共享包。Vue 页面只能通过 `editor-core` 或 `runtime-core` 操作 `three-engine`，Three.js 对象不进入 Pinia；后端使用 NestJS 模块化单体，PostgreSQL、Redis、MinIO 作为基础设施，BullMQ Worker 独立运行。

**Tech Stack:** Node.js 24、pnpm 10、Vue 3、Vite、Pinia、Element Plus、Three.js 0.183.0、Zod、NestJS 11、Fastify 5、Prisma 6、PostgreSQL、Redis、BullMQ、MinIO、Vitest、Playwright。

## Global Constraints

- 新代码只能写入 `数字孪生场景平台`，不得修改 `数字孪生前端-3DEdit` 和 `数字孪生后端-koa`。
- Three.js 精确锁定为 `three@0.183.0`，`@types/three` 精确锁定为修复缺失声明的 `0.183.1`，二者不得使用 `^`。
- 使用 Vue 3、TypeScript strict、Pinia 和 Element Plus；发布运行时不得依赖 Element Plus。
- Three.js 运行对象不得进入 Pinia 深度响应式状态。
- 不实现登录、账号、权限、多租户和业务版本管理。
- `schemaVersion` 仅用于协议迁移，`revision` 仅用于并发保存检测。
- WebSocket 是首期核心能力，不得删除为后续占位。
- 核心导出 API、资源生命周期、异步取消、命令撤销和协议约束必须写有效中文注释。
- 首期布局参考 ThreeFlowX：顶部工具栏、左侧资源区、中间视口、右侧场景/配置区和底部状态栏。

## Platform Roadmap

本计划只实施第 1 阶段；每个后续阶段在开始前单独生成详细计划并独立验收。

1. **工程基础与内核骨架**：本计划。
2. **项目、场景与模型库**：CRUD、场景保存、分片上传、MinIO、资源解析和缩略图。
3. **完整场景编辑能力**：场景树、选择、多选、变换、材质、灯光、环境、动画、标签、图表、视频和工业特效。
4. **交互与实时数据**：条件、动作、预演、WebSocket 数据源和 Socket 任务。
5. **导入导出、预览与发布**：ZIP Worker、Publication、iframe、原子发布和运行时预检。
6. **性能与质量收口**：大场景、资源复用、泄漏检测、视觉回归、完整 E2E 和部署文档。

## Locked Foundation Versions

| Package | Version |
|---|---:|
| `pnpm` | `10.12.1` |
| `typescript` | `5.9.3` |
| `vue` | `3.5.40` |
| `vite` | `7.3.6` |
| `@vitejs/plugin-vue` | `6.0.8` |
| `vue-tsc` | `3.3.7` |
| `pinia` | `4.0.2` |
| `element-plus` | `2.14.3` |
| `zod` | `4.4.3` |
| `three` | `0.183.0` |
| `@types/three` | `0.183.1` |
| `vitest` | `4.1.10` |
| `@playwright/test` | `1.61.1` |
| `@nestjs/core` | `11.1.28` |
| `@nestjs/platform-fastify` | `11.1.28` |
| `fastify` | `5.10.0` |
| `prisma` / `@prisma/client` | `6.19.2` |
| `bullmq` | `5.80.5` |
| `ioredis` | `5.11.1` |
| `minio` | `8.0.7` |

---

### Task 1: 建立 Monorepo 与质量门禁

**Files:**
- Create: `.nvmrc`
- Create: `.npmrc`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `stylelint.config.mjs`
- Create: `docs/COMMENTING.md`

**Interfaces:**
- Produces: Node 24、pnpm 10 工作区和统一 `lint`、`typecheck`、`test`、`build`、`verify` 命令。

- [ ] **Step 1: 验证执行环境并切换 Node 24**

Run:

```bash
cat > .nvmrc <<'EOF'
24
EOF
nvm install 24
nvm use 24
corepack enable
corepack prepare pnpm@10.12.1 --activate
node --version
pnpm --version
```

Expected: Node 输出 `v24.x.x`，pnpm 输出 `10.12.1`。

- [ ] **Step 2: 创建根工作区配置**

`package.json`：

```json
{
  "name": "digital-twin-scene-platform",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.12.1",
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "build": "pnpm -r --if-present build",
    "dev": "pnpm -r --parallel --if-present dev",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . && stylelint --allow-empty-input \"apps/**/*.{css,scss,vue}\"",
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "eslint": "10.7.0",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-vue": "10.9.2",
    "globals": "17.7.0",
    "prettier": "3.9.5",
    "stylelint": "17.14.0",
    "stylelint-config-recommended-vue": "1.6.1",
    "stylelint-config-standard": "40.0.0",
    "typescript": "5.9.3",
    "typescript-eslint": "8.64.0",
    "vue-eslint-parser": "10.4.1"
  }
}
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
```

`tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "skipLibCheck": false,
    "strict": true,
    "target": "ES2023",
    "useDefineForClassFields": true
  }
}
```

`.npmrc`：

```ini
auto-install-peers=false
engine-strict=true
save-exact=true
strict-peer-dependencies=true
```

`.editorconfig`：

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true
```

`.prettierrc.json`：

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

`.gitignore`：

```gitignore
.DS_Store
.env
.env.local
coverage/
dist/
node_modules/
playwright-report/
test-results/
*.log
```

- [ ] **Step 3: 创建 ESLint 与 Stylelint 配置**

`eslint.config.mjs`：

```js
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  prettier,
);
```

`stylelint.config.mjs`：

```js
export default {
  extends: ['stylelint-config-standard', 'stylelint-config-recommended-vue'],
  ignoreFiles: ['**/dist/**', '**/node_modules/**'],
  rules: {
    'selector-class-pattern': null,
  },
};
```

- [ ] **Step 4: 写明中文注释标准**

`docs/COMMENTING.md`：

```markdown
# 中文注释规范

1. 导出类、接口、函数、Composable 和服务必须说明职责与调用契约。
2. Three.js 资源必须注明创建者、共享方式和释放者。
3. 异步加载必须说明取消方式与迟到结果处理。
4. 命令必须说明 execute/undo 的对称约束。
5. 注释解释原因、边界和不可破坏的约束，不复述语法。
6. 行为变化时同步更新或删除旧注释。
```

- [ ] **Step 5: 安装依赖并验证空工作区质量命令**

Run:

```bash
pnpm install
pnpm format
pnpm format:check
pnpm lint
```

Expected: 所有命令退出码为 `0`，生成 `pnpm-lock.yaml`。

- [ ] **Step 6: 提交工程基础**

```bash
git add .
git commit -m "🏰 chore(工程): 建立平台工作区与质量门禁"
```

---

### Task 2: 建立版本化场景协议

**Files:**
- Create: `packages/scene-schema/package.json`
- Create: `packages/scene-schema/tsconfig.json`
- Create: `packages/scene-schema/src/schema.ts`
- Create: `packages/scene-schema/src/defaultDocument.ts`
- Create: `packages/scene-schema/src/index.ts`
- Create: `packages/scene-schema/tests/sceneDocument.test.ts`

**Interfaces:**
- Produces: `sceneDocumentSchema`、`SceneDocument`、`SceneNode`、`createDefaultSceneDocument()`。
- Consumes: `zod@4.4.3`。

- [ ] **Step 1: 创建包配置**

`packages/scene-schema/package.json`：

```json
{
  "name": "@digital-twin/scene-schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "zod": "4.4.3" },
  "devDependencies": { "vitest": "4.1.10" }
}
```

`packages/scene-schema/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vitest/globals"] },
  "include": ["src", "tests"]
}
```

- [ ] **Step 2: 先写失败测试**

`packages/scene-schema/tests/sceneDocument.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  createDefaultSceneDocument,
  sceneDocumentSchema,
} from '../src/index';

describe('SceneDocument', () => {
  it('创建可被协议校验的空场景', () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景一');

    expect(sceneDocumentSchema.parse(document)).toEqual(document);
    expect(document.schemaVersion).toBe(1);
    expect(document.revision).toBe(0);
  });

  it('拒绝父节点不存在的场景树', () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景一');
    document.nodes.child = {
      id: 'child',
      parentId: 'missing',
      childIds: [],
      name: '错误节点',
      enabled: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [],
      businessData: {},
    };

    expect(() => sceneDocumentSchema.parse(document)).toThrow('父节点不存在');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
pnpm --filter @digital-twin/scene-schema test
```

Expected: FAIL，提示无法找到 `../src/index`。

- [ ] **Step 4: 实现场景协议**

`packages/scene-schema/src/schema.ts`：

```ts
import { z } from 'zod';

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const transformSchema = z.object({
  position: vector3Schema,
  rotation: vector3Schema,
  scale: vector3Schema,
});

const componentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('model'), assetId: z.string().min(1) }),
  z.object({
    kind: z.literal('geometry'),
    primitive: z.enum(['box', 'sphere', 'plane', 'cylinder']),
  }),
  z.object({
    kind: z.literal('light'),
    lightType: z.enum(['ambient', 'directional', 'hemisphere', 'point', 'spot']),
    color: z.string(),
    intensity: z.number().nonnegative(),
    castShadow: z.boolean(),
  }),
  z.object({
    kind: z.enum([
      'camera',
      'text',
      'annotation',
      'image',
      'video',
      'chart',
      'shader',
      'effect',
    ]),
    data: z.record(z.string(), z.json()),
  }),
]);

export const sceneNodeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  childIds: z.array(z.string().min(1)),
  name: z.string().min(1),
  enabled: z.boolean(),
  locked: z.boolean(),
  transform: transformSchema,
  components: z.array(componentSchema),
  businessData: z.record(z.string(), z.json()),
});

const interactionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  sourceNodeId: z.string().min(1),
  trigger: z.object({ type: z.string().min(1), config: z.record(z.string(), z.json()) }),
  conditions: z.array(z.record(z.string(), z.json())),
  execution: z.enum(['sequential', 'parallel']),
  actions: z.array(z.record(z.string(), z.json())),
});

const dataSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.literal('websocket'),
  url: z.string().url(),
  enabled: z.boolean(),
  heartbeatMs: z.number().int().positive(),
  reconnectLimit: z.number().int().nonnegative(),
});

const socketTaskSchema = z.object({
  id: z.string().min(1),
  dataSourceId: z.string().min(1),
  taskCode: z.string().min(1),
  taskType: z.string().min(1),
  targetNodeId: z.string().min(1),
  taskTime: z.number().nonnegative(),
  taskData: z.record(z.string(), z.json()),
});

export const sceneDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    projectId: z.string().min(1),
    name: z.string().min(1),
    revision: z.number().int().nonnegative(),
    rootNodeIds: z.array(z.string().min(1)),
    nodes: z.record(z.string(), sceneNodeSchema),
    settings: z.object({
      background: z.string(),
      environmentAssetId: z.string().nullable(),
      exposure: z.number().positive(),
      gridVisible: z.boolean(),
    }),
    interactions: z.array(interactionSchema),
    dataSources: z.array(dataSourceSchema),
    socketTasks: z.array(socketTaskSchema),
    assetReferences: z.array(
      z.object({ assetId: z.string().min(1), nodeIds: z.array(z.string().min(1)) }),
    ),
  })
  .superRefine((document, context) => {
    for (const [key, node] of Object.entries(document.nodes)) {
      if (key !== node.id) {
        context.addIssue({ code: 'custom', message: `节点键与 id 不一致: ${key}` });
      }
      if (node.parentId && !document.nodes[node.parentId]) {
        context.addIssue({ code: 'custom', message: `父节点不存在: ${node.parentId}` });
      }
    }
    for (const id of document.rootNodeIds) {
      if (!document.nodes[id] || document.nodes[id].parentId !== null) {
        context.addIssue({ code: 'custom', message: `根节点无效: ${id}` });
      }
    }
  });

export type SceneDocument = z.infer<typeof sceneDocumentSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type Transform = z.infer<typeof transformSchema>;
```

`packages/scene-schema/src/defaultDocument.ts`：

```ts
import type { SceneDocument } from './schema';

/** 创建不含业务节点的可保存场景，供新建项目和测试复用。 */
export function createDefaultSceneDocument(
  projectId: string,
  sceneId: string,
  name: string,
): SceneDocument {
  return {
    schemaVersion: 1,
    id: sceneId,
    projectId,
    name,
    revision: 0,
    rootNodeIds: [],
    nodes: {},
    settings: {
      background: '#111827',
      environmentAssetId: null,
      exposure: 1,
      gridVisible: true,
    },
    interactions: [],
    dataSources: [],
    socketTasks: [],
    assetReferences: [],
  };
}
```

`packages/scene-schema/src/index.ts`：

```ts
export { createDefaultSceneDocument } from './defaultDocument';
export {
  sceneDocumentSchema,
  sceneNodeSchema,
  transformSchema,
  type SceneDocument,
  type SceneNode,
  type Transform,
} from './schema';
```

- [ ] **Step 5: 运行测试与类型检查**

Run:

```bash
pnpm install
pnpm --filter @digital-twin/scene-schema test
pnpm --filter @digital-twin/scene-schema typecheck
```

Expected: 2 tests PASS，类型检查退出码为 `0`。

- [ ] **Step 6: 提交场景协议**

```bash
git add packages/scene-schema pnpm-lock.yaml
git commit -m "💥 feat(场景协议): 建立可校验的场景文档模型"
```

---

### Task 3: 建立命令历史与文档事务

**Files:**
- Create: `packages/editor-core/package.json`
- Create: `packages/editor-core/tsconfig.json`
- Create: `packages/editor-core/src/commands/types.ts`
- Create: `packages/editor-core/src/commands/CommandHistory.ts`
- Create: `packages/editor-core/src/commands/AddNodeCommand.ts`
- Create: `packages/editor-core/src/index.ts`
- Create: `packages/editor-core/tests/CommandHistory.test.ts`

**Interfaces:**
- Consumes: `SceneDocument`、`SceneNode`。
- Produces: `EditorCommand<TContext>`、`CommandHistory<TContext>`、`AddNodeCommand`。

- [ ] **Step 1: 写失败测试**

`packages/editor-core/tests/CommandHistory.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultSceneDocument, type SceneNode } from '@digital-twin/scene-schema';
import { AddNodeCommand, CommandHistory } from '../src';

describe('CommandHistory', () => {
  it('执行、撤销和重做新增节点', async () => {
    const context = { document: createDefaultSceneDocument('p1', 's1', '场景一') };
    const history = new CommandHistory(context);
    const node: SceneNode = {
      id: 'box-1',
      parentId: null,
      childIds: [],
      name: '立方体',
      enabled: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [{ kind: 'geometry', primitive: 'box' }],
      businessData: {},
    };

    await history.execute(new AddNodeCommand(node));
    expect(context.document.nodes['box-1']).toEqual(node);
    expect(history.isDirty).toBe(true);

    await history.undo();
    expect(context.document.nodes['box-1']).toBeUndefined();

    await history.redo();
    expect(context.document.nodes['box-1']).toEqual(node);
  });

  it('保存点之后无修改时不标记为脏', async () => {
    const context = { document: createDefaultSceneDocument('p1', 's1', '场景一') };
    const history = new CommandHistory(context);
    history.markSaved();
    expect(history.isDirty).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @digital-twin/editor-core test`

Expected: FAIL，包或导出尚不存在。

- [ ] **Step 3: 实现命令协议和历史**

`packages/editor-core/src/commands/types.ts`：

```ts
export interface EditorCommand<TContext> {
  readonly label: string;
  execute(context: TContext): void | Promise<void>;
  undo(context: TContext): void | Promise<void>;
  merge?(next: EditorCommand<TContext>): EditorCommand<TContext> | undefined;
}
```

`packages/editor-core/src/commands/CommandHistory.ts`：

```ts
import type { EditorCommand } from './types';

/**
 * 命令历史只记录已经成功执行的命令。execute 或 undo 抛错时游标保持不变，
 * 避免文档状态与历史索引失去同步。
 */
export class CommandHistory<TContext> {
  private commands: EditorCommand<TContext>[] = [];
  private cursor = 0;
  private savedCursor = 0;

  constructor(private readonly context: TContext) {}

  get isDirty(): boolean {
    return this.cursor !== this.savedCursor;
  }

  async execute(command: EditorCommand<TContext>): Promise<void> {
    await command.execute(this.context);
    this.commands.splice(this.cursor);
    const previous = this.commands[this.commands.length - 1];
    const merged = previous?.merge?.(command);
    if (merged) this.commands[this.commands.length - 1] = merged;
    else this.commands.push(command);
    this.cursor = this.commands.length;
  }

  async undo(): Promise<void> {
    if (this.cursor === 0) return;
    const command = this.commands[this.cursor - 1];
    if (!command) return;
    await command.undo(this.context);
    this.cursor -= 1;
  }

  async redo(): Promise<void> {
    const command = this.commands[this.cursor];
    if (!command) return;
    await command.execute(this.context);
    this.cursor += 1;
  }

  markSaved(): void {
    this.savedCursor = this.cursor;
  }
}
```

`packages/editor-core/src/commands/AddNodeCommand.ts`：

```ts
import type { SceneDocument, SceneNode } from '@digital-twin/scene-schema';
import type { EditorCommand } from './types';

interface DocumentContext {
  document: SceneDocument;
}

/** 新增节点命令同时维护 nodes、根节点或父节点 childIds。 */
export class AddNodeCommand implements EditorCommand<DocumentContext> {
  readonly label = '新增节点';

  constructor(private readonly node: SceneNode) {}

  execute(context: DocumentContext): void {
    if (context.document.nodes[this.node.id]) throw new Error(`节点已存在: ${this.node.id}`);
    const parent = this.node.parentId ? context.document.nodes[this.node.parentId] : undefined;
    if (this.node.parentId && !parent) throw new Error(`父节点不存在: ${this.node.parentId}`);

    // 所有前置条件通过后才修改文档，保证命令失败时不留下半完成节点。
    context.document.nodes[this.node.id] = structuredClone(this.node);
    if (this.node.parentId) {
      parent?.childIds.push(this.node.id);
    } else {
      context.document.rootNodeIds.push(this.node.id);
    }
  }

  undo(context: DocumentContext): void {
    delete context.document.nodes[this.node.id];
    const siblings = this.node.parentId
      ? context.document.nodes[this.node.parentId]?.childIds
      : context.document.rootNodeIds;
    if (!siblings) return;
    const index = siblings.indexOf(this.node.id);
    if (index >= 0) siblings.splice(index, 1);
  }
}
```

`packages/editor-core/src/index.ts`：

```ts
export { AddNodeCommand } from './commands/AddNodeCommand';
export { CommandHistory } from './commands/CommandHistory';
export type { EditorCommand } from './commands/types';
```

`packages/editor-core/package.json`：

```json
{
  "name": "@digital-twin/editor-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@digital-twin/scene-schema": "workspace:*"
  },
  "devDependencies": { "vitest": "4.1.10" }
}
```

`packages/editor-core/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vitest/globals"] },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: 运行测试和类型检查**

Run:

```bash
pnpm install
pnpm --filter @digital-twin/editor-core test
pnpm --filter @digital-twin/editor-core typecheck
```

Expected: 2 tests PASS，类型检查退出码为 `0`。

- [ ] **Step 5: 提交命令系统**

```bash
git add packages/editor-core pnpm-lock.yaml
git commit -m "💥 feat(编辑器内核): 建立命令历史与文档事务"
```

---

### Task 4: 建立 Three.js r183 引擎生命周期

**Files:**
- Create: `packages/three-engine/package.json`
- Create: `packages/three-engine/tsconfig.json`
- Create: `packages/three-engine/src/ResourceTracker.ts`
- Create: `packages/three-engine/src/EditorEngine.ts`
- Create: `packages/three-engine/src/index.ts`
- Create: `packages/three-engine/tests/ResourceTracker.test.ts`

**Interfaces:**
- Produces: `EditorEngine.initialize()`、`resize()`、`invalidate()`、`dispose()` 和 `ResourceTracker`。
- Consumes: HTML 容器和 Three.js r183。

- [ ] **Step 1: 写资源释放失败测试**

`packages/three-engine/tests/ResourceTracker.test.ts`：

```ts
import { BoxGeometry, Mesh, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ResourceTracker } from '../src';

describe('ResourceTracker', () => {
  it('同一共享资源只释放一次', () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const tracker = new ResourceTracker();

    tracker.track(new Mesh(geometry, material));
    tracker.track(new Mesh(geometry, material));
    tracker.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @digital-twin/three-engine test`

Expected: FAIL，`ResourceTracker` 不存在。

- [ ] **Step 3: 实现资源追踪器**

`packages/three-engine/src/ResourceTracker.ts`：

```ts
import type { Material, Object3D, Texture } from 'three';

type Disposable = { dispose(): void };

function isDisposable(value: unknown): value is Disposable {
  return typeof value === 'object' && value !== null && 'dispose' in value;
}

/**
 * 记录当前引擎生命周期独占的资源。集合去重保证共享 Geometry、Material、Texture
 * 不会因多个 Mesh 引用而重复释放。
 */
export class ResourceTracker {
  private readonly resources = new Set<Disposable>();

  track(root: Object3D): void {
    root.traverse((object) => {
      const candidate = object as Object3D & {
        geometry?: Disposable;
        material?: Material | Material[];
      };
      if (candidate.geometry) this.resources.add(candidate.geometry);
      const materials = Array.isArray(candidate.material)
        ? candidate.material
        : candidate.material
          ? [candidate.material]
          : [];
      for (const material of materials) this.trackMaterial(material);
    });
  }

  private trackMaterial(material: Material): void {
    this.resources.add(material);
    for (const value of Object.values(material)) {
      if ((value as Texture | undefined)?.isTexture && isDisposable(value)) {
        this.resources.add(value);
      }
    }
  }

  dispose(): void {
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}
```

- [ ] **Step 4: 实现编辑器引擎**

`packages/three-engine/src/EditorEngine.ts`：

```ts
import {
  Clock,
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ResourceTracker } from './ResourceTracker';

/** 统一拥有渲染循环、ResizeObserver、Controls、Composer 和 GPU 资源。 */
export class EditorEngine {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.01, 10000);
  private readonly clock = new Clock();
  private readonly resources = new ResourceTracker();
  private renderer?: WebGLRenderer;
  private controls?: OrbitControls;
  private composer?: EffectComposer;
  private outline?: OutlinePass;
  private resizeObserver?: ResizeObserver;
  private frameId?: number;
  private invalidated = true;
  private disposed = false;

  async initialize(container: HTMLElement): Promise<void> {
    if (this.renderer) throw new Error('EditorEngine 已初始化');
    this.scene.background = new Color('#111827');
    this.camera.position.set(5, 3, 8);

    const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    container.append(renderer.domElement);
    this.renderer = renderer;

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 0.5, 0);
    this.controls.addEventListener('change', this.invalidate);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outline = new OutlinePass(new Vector2(1, 1), this.scene, this.camera);
    this.composer.addPass(this.outline);

    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio);
    });
    this.resizeObserver.observe(container);
    this.loop();
  }

  readonly invalidate = (): void => {
    this.invalidated = true;
  };

  resize(width: number, height: number, dpr: number): void {
    if (!this.renderer || !this.composer || width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(dpr, 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.outline?.setSize(width, height);
    this.invalidate();
  }

  private readonly loop = (): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    this.controls?.update(delta);
    if (!this.invalidated) return;
    this.composer?.render(delta);
    this.invalidated = false;
  };

  track(root: Parameters<ResourceTracker['track']>[0]): void {
    this.resources.track(root);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.controls?.removeEventListener('change', this.invalidate);
    this.controls?.dispose();
    this.composer?.dispose();
    this.resources.dispose();
    const canvas = this.renderer?.domElement;
    this.renderer?.dispose();
    canvas?.remove();
  }
}
```

`packages/three-engine/src/index.ts`：

```ts
export { EditorEngine } from './EditorEngine';
export { ResourceTracker } from './ResourceTracker';
```

`packages/three-engine/package.json`：

```json
{
  "name": "@digital-twin/three-engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "three": "0.183.0" },
  "devDependencies": {
    "@types/three": "0.183.1",
    "vitest": "4.1.10"
  }
}
```

`packages/three-engine/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vitest/globals"] },
  "include": ["src", "tests"]
}
```

- [ ] **Step 5: 运行测试和类型检查**

Run:

```bash
pnpm install
pnpm --filter @digital-twin/three-engine test
pnpm --filter @digital-twin/three-engine typecheck
```

Expected: 1 test PASS，类型检查退出码为 `0`。

- [ ] **Step 6: 提交引擎生命周期**

```bash
git add packages/three-engine pnpm-lock.yaml
git commit -m "💥 feat(渲染内核): 建立Three场景生命周期与资源释放"
```

---

### Task 5: 建立编辑器 Web 工作台与引擎接入

**Files:**
- Create: `apps/editor-web/package.json`
- Create: `apps/editor-web/tsconfig.json`
- Create: `apps/editor-web/vite.config.ts`
- Create: `apps/editor-web/index.html`
- Create: `apps/editor-web/src/main.ts`
- Create: `apps/editor-web/src/App.vue`
- Create: `apps/editor-web/src/router.ts`
- Create: `apps/editor-web/src/stores/document.ts`
- Create: `apps/editor-web/src/components/EditorCanvas.vue`
- Create: `apps/editor-web/src/views/EditorWorkspace.vue`
- Create: `apps/editor-web/src/views/ProjectsView.vue`
- Create: `apps/editor-web/src/views/AssetsView.vue`
- Create: `apps/editor-web/src/styles/editor.scss`
- Create: `apps/editor-web/tests/EditorWorkspace.test.ts`

**Interfaces:**
- Consumes: `EditorEngine`、`createDefaultSceneDocument()`。
- Produces: `/projects`、`/assets`、`/editor/:projectId/:sceneId` 路由和参考 ThreeFlowX 的五区工作台。

- [ ] **Step 1: 写工作台失败测试**

```ts
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { describe, expect, it, vi } from 'vitest';
import EditorWorkspace from '../src/views/EditorWorkspace.vue';

describe('EditorWorkspace', () => {
  it('呈现资源区、视口、场景区和状态栏', () => {
    const wrapper = mount(EditorWorkspace, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: { EditorCanvas: { template: '<div data-testid="editor-canvas" />' } },
      },
    });

    expect(wrapper.get('[data-testid="top-toolbar"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="asset-panel"]').text()).toContain('模型');
    expect(wrapper.get('[data-testid="inspector-panel"]').text()).toContain('场景内容');
    expect(wrapper.get('[data-testid="status-bar"]').text()).toContain('FPS');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @digital-twin/editor-web test`

Expected: FAIL，编辑器应用尚不存在。

- [ ] **Step 3: 创建 Vite、Pinia 和路由入口**

应用精确依赖 `vue@3.5.40`、`vue-router@4.6.3`、`pinia@4.0.2`、`element-plus@2.14.3`、工作区内 `scene-schema`、`editor-core`、`three-engine`；开发依赖 Vite、Vue 插件、vue-tsc、Vitest、Vue Test Utils、Pinia Testing 和 happy-dom。

`src/main.ts`：

```ts
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/editor.scss';

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app');
```

`src/router.ts`：

```ts
import { createRouter, createWebHistory } from 'vue-router';
import AssetsView from './views/AssetsView.vue';
import EditorWorkspace from './views/EditorWorkspace.vue';
import ProjectsView from './views/ProjectsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', component: ProjectsView },
    { path: '/assets', component: AssetsView },
    { path: '/editor/:projectId/:sceneId', component: EditorWorkspace },
  ],
});
```

- [ ] **Step 4: 创建文档 Store 和 Canvas 生命周期组件**

`src/stores/document.ts`：

```ts
import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useDocumentStore = defineStore('document', () => {
  const document = ref(createDefaultSceneDocument('local-project', 'local-scene', '场景一'));
  return { document };
});
```

`src/components/EditorCanvas.vue`：

```vue
<script setup lang="ts">
import { EditorEngine } from '@digital-twin/three-engine';
import { onBeforeUnmount, onMounted, ref } from 'vue';

const container = ref<HTMLDivElement>();
const engine = new EditorEngine();

onMounted(async () => {
  if (!container.value) return;
  await engine.initialize(container.value);
  container.value.dataset.engineReady = 'true';
});

onBeforeUnmount(() => engine.dispose());
</script>

<template><div ref="container" class="editor-canvas" data-testid="editor-canvas" /></template>
```

- [ ] **Step 5: 创建工作台布局**

`EditorWorkspace.vue` 必须包含以下稳定测试属性：

```vue
<script setup lang="ts">
import EditorCanvas from '../components/EditorCanvas.vue';
</script>

<template>
  <main class="editor-workspace">
    <header data-testid="top-toolbar">场景一　撤销　重做　保存　预览　发布</header>
    <aside data-testid="asset-panel">模型　几何体　灯光　图表　文本　视频　Shader</aside>
    <EditorCanvas />
    <aside data-testid="inspector-panel">场景内容　交互事件　Socket 任务　项目配置</aside>
    <footer data-testid="status-bar">对象 0　顶点 0　面 0　FPS --　已保存</footer>
  </main>
</template>
```

`src/styles/editor.scss`：

```scss
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

.editor-workspace {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 380px;
  grid-template-rows: 48px minmax(0, 1fr) 24px;
  width: 100%;
  height: 100%;
  color: #e5e7eb;
  background: #0b1020;
}

[data-testid='top-toolbar'] {
  grid-column: 1 / -1;
  padding: 12px 16px;
  border-bottom: 1px solid #263047;
}

[data-testid='asset-panel'],
[data-testid='inspector-panel'] {
  min-height: 0;
  padding: 12px;
  overflow: auto;
  background: #111827;
}

.editor-canvas {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

[data-testid='status-bar'] {
  grid-column: 1 / -1;
  padding: 3px 12px;
  border-top: 1px solid #263047;
}
```

- [ ] **Step 6: 运行测试、类型检查和构建**

Run:

```bash
pnpm install
pnpm --filter @digital-twin/editor-web test
pnpm --filter @digital-twin/editor-web typecheck
pnpm --filter @digital-twin/editor-web build
```

Expected: 工作台测试 PASS，生成 `apps/editor-web/dist`。

- [ ] **Step 7: 提交编辑器壳**

```bash
git add apps/editor-web pnpm-lock.yaml
git commit -m "🌷 UI(编辑器): 建立场景工作台与Three视口"
```

---

### Task 6: 建立独立运行时 Web 应用

**Files:**
- Create: `apps/runtime-web/package.json`
- Create: `apps/runtime-web/tsconfig.json`
- Create: `apps/runtime-web/vite.config.ts`
- Create: `apps/runtime-web/index.html`
- Create: `apps/runtime-web/src/main.ts`
- Create: `apps/runtime-web/src/App.vue`
- Create: `apps/runtime-web/src/RuntimeCanvas.vue`
- Create: `apps/runtime-web/tests/runtimeDependencies.test.ts`

**Interfaces:**
- Consumes: `@digital-twin/scene-schema`、`@digital-twin/three-engine`。
- Produces: `/preview/:sceneId` 和 `/runtime/:publicationId` 可复用的纯运行时壳。

- [ ] **Step 1: 写运行时依赖约束测试**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('runtime-web dependencies', () => {
  it('不引入编辑器和 Element Plus', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(packageJson.dependencies['element-plus']).toBeUndefined();
    expect(packageJson.dependencies['@digital-twin/editor-core']).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @digital-twin/runtime-web test`

Expected: FAIL，运行时包尚不存在。

- [ ] **Step 3: 创建纯运行时应用**

运行时仅依赖 Vue、Vue Router、scene-schema 和 three-engine。`RuntimeCanvas.vue` 与编辑器 Canvas 使用相同的 `EditorEngine` 生命周期，但不渲染任何编辑面板；组件卸载必须调用 `dispose()`。

`App.vue`：

```vue
<script setup lang="ts">
import RuntimeCanvas from './RuntimeCanvas.vue';
</script>

<template>
  <main class="runtime-shell">
    <RuntimeCanvas />
  </main>
</template>

<style>
html, body, #app, .runtime-shell { width: 100%; height: 100%; margin: 0; overflow: hidden; }
</style>
```

- [ ] **Step 4: 验证依赖、类型和构建**

Run:

```bash
pnpm install
pnpm --filter @digital-twin/runtime-web test
pnpm --filter @digital-twin/runtime-web typecheck
pnpm --filter @digital-twin/runtime-web build
rg -n "element-plus|editor-core" apps/runtime-web/dist && exit 1 || true
```

Expected: 测试 PASS，构建成功，产物中不存在 Element Plus 或 editor-core。

- [ ] **Step 5: 提交运行时壳**

```bash
git add apps/runtime-web pnpm-lock.yaml
git commit -m "💥 feat(运行时): 建立独立场景预览应用"
```

---

### Task 7: 建立 API 契约、Prisma 数据模型和健康检查

**Files:**
- Create: `packages/api-contracts/package.json`
- Create: `packages/api-contracts/src/health.ts`
- Create: `packages/api-contracts/src/index.ts`
- Create: `apps/api-server/package.json`
- Create: `apps/api-server/tsconfig.json`
- Create: `apps/api-server/prisma/schema.prisma`
- Create: `apps/api-server/src/main.ts`
- Create: `apps/api-server/src/app.module.ts`
- Create: `apps/api-server/src/infrastructure/prisma.service.ts`
- Create: `apps/api-server/src/infrastructure/redis.service.ts`
- Create: `apps/api-server/src/infrastructure/minio.service.ts`
- Create: `apps/api-server/src/health/health.controller.ts`
- Create: `apps/api-server/src/health/health.service.ts`
- Create: `apps/api-server/tests/health.service.test.ts`

**Interfaces:**
- Produces: `GET /api/health -> HealthResponse`。
- Produces: 首期八张 Prisma 表，不包含账号和版本表。

- [ ] **Step 1: 写健康状态失败测试**

```ts
import { describe, expect, it, vi } from 'vitest';
import { HealthService } from '../src/health/health.service';

describe('HealthService', () => {
  it('三个依赖可用时返回 ok', async () => {
    const service = new HealthService(
      { ping: vi.fn().mockResolvedValue(undefined) },
      { ping: vi.fn().mockResolvedValue('PONG') },
      { ping: vi.fn().mockResolvedValue(undefined) },
    );
    await expect(service.check()).resolves.toMatchObject({ status: 'ok' });
  });

  it('任一依赖失败时返回 degraded', async () => {
    const service = new HealthService(
      { ping: vi.fn().mockRejectedValue(new Error('database down')) },
      { ping: vi.fn().mockResolvedValue('PONG') },
      { ping: vi.fn().mockResolvedValue(undefined) },
    );
    await expect(service.check()).resolves.toMatchObject({
      status: 'degraded',
      services: { postgres: 'down' },
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @digital-twin/api-server test`

Expected: FAIL，API 应用尚不存在。

- [ ] **Step 3: 定义共享健康契约**

```ts
export interface HealthResponse {
  status: 'ok' | 'degraded';
  services: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
    minio: 'up' | 'down';
  };
  timestamp: string;
}
```

- [ ] **Step 4: 创建 Prisma 数据模型**

`apps/api-server/prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Project {
  id          String       @id @default(cuid())
  name        String
  description String       @default("")
  coverKey    String?
  scenes      Scene[]
  publication Publication?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model Scene {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name        String
  sortOrder   Int      @default(0)
  revision    Int      @default(0)
  document    Json
  contentHash String   @default("")
  coverKey    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([projectId, sortOrder])
}

model Asset {
  id           String            @id @default(cuid())
  name         String
  kind         String
  format       String
  status       String            @default("processing")
  sourceHash   String            @unique
  metadata     Json
  files        AssetFile[]
  dependencies AssetDependency[] @relation("AssetDependencies")
  dependents   AssetDependency[] @relation("AssetDependents")
  jobs         ProcessingJob[]
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
}

model AssetFile {
  id        String   @id @default(cuid())
  assetId   String
  asset     Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  role      String
  objectKey String   @unique
  mimeType  String
  size      BigInt
  checksum  String
  createdAt DateTime @default(now())

  @@index([assetId, role])
}

model AssetDependency {
  assetId      String
  dependencyId String
  asset        Asset @relation("AssetDependencies", fields: [assetId], references: [id], onDelete: Cascade)
  dependency   Asset @relation("AssetDependents", fields: [dependencyId], references: [id], onDelete: Restrict)

  @@id([assetId, dependencyId])
}

model ProcessingJob {
  id        String   @id @default(cuid())
  assetId   String?
  asset     Asset?   @relation(fields: [assetId], references: [id], onDelete: SetNull)
  type      String
  status    String   @default("queued")
  progress  Int      @default(0)
  error     String?
  payload   Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, createdAt])
}

model Publication {
  id          String   @id @default(cuid())
  projectId   String   @unique
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sceneId     String
  objectKey   String
  contentHash String
  status      String   @default("active")
  publishedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model DataSource {
  id        String   @id @default(cuid())
  sceneId   String
  name      String
  type      String
  config    Json
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([sceneId])
}
```

- [ ] **Step 5: 实现基础设施服务与健康检查**

`HealthService.check()` 使用 `Promise.allSettled` 并将依赖映射为 `up/down`。Prisma `ping()` 执行 `SELECT 1`，Redis `ping()` 调用 ioredis，MinIO `ping()` 调用 `bucketExists()`；任何单项失败都返回 `degraded`，不能让健康接口抛出 500。

`main.ts` 使用 `NestFactory.create(AppModule, new FastifyAdapter())`，设置全局前缀 `api`，监听 `0.0.0.0:3000`，并启用 Swagger `/api/docs`。

- [ ] **Step 6: 运行单元测试与 Prisma 校验**

Run:

```bash
pnpm install
pnpm --filter @digital-twin/api-server exec prisma validate
pnpm --filter @digital-twin/api-server test
pnpm --filter @digital-twin/api-server typecheck
```

Expected: Prisma schema valid，2 tests PASS。

- [ ] **Step 7: 提交 API 基础**

```bash
git add packages/api-contracts apps/api-server pnpm-lock.yaml
git commit -m "💥 feat(服务端): 建立平台数据模型与健康检查"
```

---

### Task 8: 建立 BullMQ Worker 与基础任务

**Files:**
- Create: `apps/asset-worker/package.json`
- Create: `apps/asset-worker/tsconfig.json`
- Create: `apps/asset-worker/src/jobs/foundationPing.ts`
- Create: `apps/asset-worker/src/main.ts`
- Create: `apps/asset-worker/tests/foundationPing.test.ts`

**Interfaces:**
- Consumes: BullMQ 队列 `asset-processing`。
- Produces: `foundation-ping` 任务处理器，返回 `{ ok: true, workerId }`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { processFoundationPing } from '../src/jobs/foundationPing';

describe('processFoundationPing', () => {
  it('返回可序列化的 Worker 心跳', async () => {
    await expect(processFoundationPing('worker-test')).resolves.toEqual({
      ok: true,
      workerId: 'worker-test',
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @digital-twin/asset-worker test`

Expected: FAIL，处理器不存在。

- [ ] **Step 3: 实现纯任务处理器与 Worker 入口**

```ts
/** Worker 心跳任务用于验证 Redis、队列注册和进程生命周期。 */
export async function processFoundationPing(workerId: string) {
  return { ok: true as const, workerId };
}
```

`main.ts` 创建 `new Worker('asset-processing', ...)`；只接受 `foundation-ping`，未知任务抛出包含任务名的错误。监听 SIGINT/SIGTERM，等待 `worker.close()` 后退出，避免正在执行的资源任务被强制中断。

- [ ] **Step 4: 运行测试和类型检查**

Run:

```bash
pnpm install
pnpm --filter @digital-twin/asset-worker test
pnpm --filter @digital-twin/asset-worker typecheck
```

Expected: 1 test PASS。

- [ ] **Step 5: 提交 Worker**

```bash
git add apps/asset-worker pnpm-lock.yaml
git commit -m "💥 feat(资源任务): 建立BullMQ工作进程骨架"
```

---

### Task 9: 建立 Docker 基础设施与真实健康检查

**Files:**
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `infrastructure/docker/minio-init.sh`
- Create: `apps/api-server/prisma/migrations/0001_foundation/migration.sql`

**Interfaces:**
- Produces: PostgreSQL `5432`、Redis `6379`、MinIO API `9000`、MinIO Console `9001`。
- Consumes: API 的 `DATABASE_URL`、`REDIS_URL`、`MINIO_*` 环境变量。

- [ ] **Step 1: 创建环境模板**

```dotenv
DATABASE_URL=postgresql://digital_twin:digital_twin@localhost:5432/digital_twin
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=digital-twin
MINIO_SECRET_KEY=digital-twin-secret
MINIO_USE_SSL=false
MINIO_BUCKET=assets
```

- [ ] **Step 2: 创建 Docker Compose**

`docker-compose.yml`：

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: digital_twin
      POSTGRES_PASSWORD: digital_twin
      POSTGRES_USER: digital_twin
    ports: ['5432:5432']
    volumes: [postgres-data:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U digital_twin -d digital_twin']
      interval: 5s
      timeout: 3s
      retries: 20

  redis:
    image: redis:8-alpine
    ports: ['6379:6379']
    volumes: [redis-data:/data]
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 20

  minio:
    image: minio/minio:RELEASE.2025-04-22T22-12-26Z
    command: server /data --console-address ':9001'
    environment:
      MINIO_ROOT_USER: digital-twin
      MINIO_ROOT_PASSWORD: digital-twin-secret
    ports: ['9000:9000', '9001:9001']
    volumes: [minio-data:/data]
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 5s
      timeout: 3s
      retries: 20

  minio-init:
    image: minio/mc:RELEASE.2025-04-16T18-13-26Z
    depends_on:
      minio: { condition: service_healthy }
    entrypoint: ['/bin/sh', '/init/minio-init.sh']
    environment:
      MINIO_ACCESS_KEY: digital-twin
      MINIO_SECRET_KEY: digital-twin-secret
    volumes:
      - ./infrastructure/docker/minio-init.sh:/init/minio-init.sh:ro

volumes:
  minio-data:
  postgres-data:
  redis-data:
```

`infrastructure/docker/minio-init.sh`：

```sh
#!/bin/sh
set -eu
mc alias set local http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mb --ignore-existing local/assets
```

- [ ] **Step 3: 生成并检查首个迁移**

Run:

```bash
cp .env.example .env
docker compose up -d postgres redis minio minio-init
pnpm --filter @digital-twin/api-server exec prisma migrate dev --name foundation
pnpm --filter @digital-twin/api-server exec prisma migrate status
```

Expected: 所有迁移已应用，Docker 服务为 healthy。

- [ ] **Step 4: 启动 API 并验证真实依赖**

Run:

```bash
pnpm --filter @digital-twin/api-server dev
curl --fail http://localhost:3000/api/health
```

Expected JSON:

```json
{
  "status": "ok",
  "services": { "postgres": "up", "redis": "up", "minio": "up" }
}
```

`timestamp` 为 ISO 字符串。

- [ ] **Step 5: 提交基础设施**

```bash
git add .env.example docker-compose.yml infrastructure apps/api-server/prisma/migrations
git commit -m "📦 build(基础设施): 接入数据库缓存与对象存储"
```

---

### Task 10: 建立真实浏览器冒烟测试与总验证

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/editor-foundation.spec.ts`
- Create: `tests/e2e/runtime-foundation.spec.ts`
- Modify: `package.json`
- Create: `README.md`

**Interfaces:**
- Consumes: editor-web `5173`、runtime-web `5174`、api-server `3000`。
- Produces: `pnpm test:e2e` 和完整 `pnpm verify`。

- [ ] **Step 1: 写编辑器真实 WebGL 失败测试**

```ts
import { expect, test } from '@playwright/test';

test('编辑器工作台创建真实 WebGL Canvas', async ({ page }) => {
  await page.goto('/editor/local-project/local-scene');
  await expect(page.getByTestId('top-toolbar')).toBeVisible();
  const canvasHost = page.getByTestId('editor-canvas');
  await expect(canvasHost).toHaveAttribute('data-engine-ready', 'true');
  await expect(canvasHost.locator('canvas')).toHaveCount(1);
});
```

- [ ] **Step 2: 写运行时隔离失败测试**

```ts
import { expect, test } from '@playwright/test';

test('运行时只有 Canvas 没有编辑面板', async ({ page }) => {
  await page.goto('http://localhost:5174/runtime/local-publication');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('asset-panel')).toHaveCount(0);
  await expect(page.getByTestId('inspector-panel')).toHaveCount(0);
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test:e2e`

Expected: FAIL，Playwright 配置或 Web Server 尚不存在。

- [ ] **Step 4: 配置 Playwright Web Server**

`playwright.config.ts` 使用 Chromium，并通过 `webServer` 同时启动 editor-web 和 runtime-web。Chromium 参数加入 `--use-gl=swiftshader`，测试失败保留截图和 trace。编辑器 baseURL 为 `http://127.0.0.1:5173`。

根 `package.json` 新增：

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1"
  }
}
```

- [ ] **Step 5: 编写根 README**

`README.md`：

````markdown
# 数字孪生场景平台

全新 Vue 3 + Three.js r183 数字孪生场景编辑器。旧 React 前端与旧 Koa 后端不属于本仓库，禁止从本仓库脚本修改。

## 环境

- Node.js 24
- pnpm 10.12.1
- Docker Desktop

## 启动

```bash
corepack prepare pnpm@10.12.1 --activate
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

端口：编辑器 5173、运行时 5174、API 3000、PostgreSQL 5432、Redis 6379、MinIO 9000/9001。

## 验证

```bash
pnpm verify
```

Three.js 与类型声明都精确锁定为 0.183.0。中文注释要求见 [docs/COMMENTING.md](docs/COMMENTING.md)。完整架构见 `docs/superpowers/specs/2026-07-16-digital-twin-scene-platform-design.md`。
````

- [ ] **Step 6: 运行完整验证**

Run:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm verify
docker compose ps
git diff --check
git status --short
```

Expected:

- 格式、Lint、类型检查、单元测试、构建和 E2E 全部通过。
- PostgreSQL、Redis、MinIO 为 healthy。
- `git diff --check` 无输出。
- Git 状态只包含本任务预期文件。

- [ ] **Step 7: 提交第一阶段纵向骨架**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e README.md
git commit -m "✅ tests(平台基础): 补充编辑器与运行时浏览器验收"
```

## Phase 1 Completion Gate

完成本计划后必须同时满足：

1. `pnpm verify` 全部通过。
2. 编辑器显示参考布局并创建一个真实 WebGL Canvas。
3. 运行时产物不包含 Element Plus 和 editor-core。
4. `GET /api/health` 对 PostgreSQL、Redis、MinIO 返回 `up`。
5. BullMQ Worker 能启动、优雅退出并处理基础任务。
6. 场景协议拒绝结构错误，命令系统支持 execute/undo/redo/dirty。
7. Three.js 精确为 `0.183.0`，`@types/three` 精确为 `0.183.1`。
8. 新增核心代码符合中文注释规范。
9. 旧前后端 Git 工作区没有因本计划出现新增改动。
