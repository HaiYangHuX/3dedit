# Socket Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个监听 `127.0.0.1:18080` 的独立 Socket 模拟服务，通过自动轨迹和 HTTP 接口向画布运行时广播现有 Socket 任务协议。

**Architecture:** `apps/socket-server` 使用一个 Node HTTP Server 同时承载 JSON 控制 API和 `ws` WebSocket Upgrade。协议校验、广播、自动模拟和网络生命周期拆为独立模块；网络集成测试使用随机端口，生产入口使用严格校验后的环境变量。

**Tech Stack:** Node.js 24、TypeScript 5.9、`ws` 8、Zod 4（通过 `@digital-twin/scene-schema` 复用任务枚举）、Vitest 4、PowerShell 启停脚本。

## Global Constraints

- 默认 WebSocket 地址必须保持为 `ws://127.0.0.1:18080`。
- 第一版仅用于本地模拟，不增加鉴权、第三方协议、数据库或管理 UI。
- 自动模拟默认不启动，只能由 `POST /api/demo/start` 启动。
- HTTP 请求体上限为 1 MiB；无效输入不得广播。
- 不修改 `apps/api-server/src/common/zod-validation.pipe.ts`；该文件的内容哈希与 `HEAD` 一致，仅存在换行符状态。
- 未得到新的明确授权前，不为本次功能创建 Git commit 或执行 push。

---

### Task 1: 应用骨架、配置和消息协议

**Files:**

- Create: `apps/socket-server/package.json`
- Create: `apps/socket-server/tsconfig.json`
- Create: `apps/socket-server/tsconfig.build.json`
- Create: `apps/socket-server/src/config.ts`
- Create: `apps/socket-server/src/protocol.ts`
- Create: `apps/socket-server/tests/config.test.ts`
- Create: `apps/socket-server/tests/protocol.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `loadSocketServerConfig(env?: NodeJS.ProcessEnv): SocketServerConfig`
- Produces: `parseBroadcastPayload(input: unknown): SocketTaskMessage[]`
- Produces: `SocketTaskMessage` with required `taskCode` and optional `taskType`, `taskTime`, `taskData`

- [ ] **Step 1: 创建工作区清单和 TypeScript 配置**

使用以下 scripts：`build`、`dev`、`start`、`test`、`typecheck`。依赖固定为 `@digital-twin/scene-schema: workspace:*`、`ws: 8.18.3`、`zod: 4.4.3`；开发依赖沿用仓库的 Node 24、TypeScript、tsx、Vitest 和 `@types/ws` 版本。执行 `pnpm install --lockfile-only`，只增加 workspace importer，不升级现有依赖。

- [ ] **Step 2: 先写配置失败测试**

```ts
expect(loadSocketServerConfig({})).toEqual({
  host: '127.0.0.1',
  port: 18080,
  demoIntervalMs: 1000,
  demoRadius: 5,
});
expect(() => loadSocketServerConfig({ SOCKET_PORT: '0' })).toThrow();
expect(() =>
  loadSocketServerConfig({ SOCKET_DEMO_INTERVAL_MS: '1.5' }),
).toThrow();
```

- [ ] **Step 3: 运行配置测试并确认因模块缺失而失败**

Run: `pnpm --filter @digital-twin/socket-server test -- config.test.ts`

Expected: FAIL，原因是 `src/config.ts` 尚不存在，而不是测试语法错误。

- [ ] **Step 4: 实现严格环境配置解析**

```ts
export interface SocketServerConfig {
  host: string;
  port: number;
  demoIntervalMs: number;
  demoRadius: number;
}

export function loadSocketServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): SocketServerConfig;
```

端口只允许 1..65535 的整数，间隔为正整数，半径为有限非负数。

- [ ] **Step 5: 运行配置测试并确认通过**

Run: `pnpm --filter @digital-twin/socket-server test -- config.test.ts`

Expected: PASS。

- [ ] **Step 6: 先写协议失败测试**

覆盖合法单条、合法数组，以及缺少/空 `taskCode`、非法 `taskType`、负数或小数 `taskTime`、数组或标量 `taskData`。

```ts
expect(
  parseBroadcastPayload({
    taskCode: 'device-position',
    taskType: 'ModelPosition',
    taskTime: 800,
    taskData: { x: 1, y: 0, z: 2 },
  }),
).toHaveLength(1);
expect(() =>
  parseBroadcastPayload({ taskCode: '', taskData: {} }),
).toThrow();
```

- [ ] **Step 7: 运行协议测试并确认因导出缺失而失败**

Run: `pnpm --filter @digital-twin/socket-server test -- protocol.test.ts`

Expected: FAIL，原因是 `parseBroadcastPayload` 尚未实现。

- [ ] **Step 8: 实现消息协议并复用任务类型枚举**

```ts
const socketTaskMessageSchema = z.object({
  taskCode: z.string().min(1),
  taskType: socketTaskTypeSchema.optional(),
  taskTime: z.number().int().nonnegative().optional(),
  taskData: z.record(z.string(), z.json()).optional(),
});

export function parseBroadcastPayload(input: unknown): SocketTaskMessage[] {
  const value = z
    .union([socketTaskMessageSchema, z.array(socketTaskMessageSchema)])
    .parse(input);
  return Array.isArray(value) ? value : [value];
}
```

- [ ] **Step 9: 运行 Task 1 测试、类型和格式检查**

```powershell
pnpm --filter @digital-twin/socket-server test
pnpm --filter @digital-twin/socket-server typecheck
pnpm prettier --check "apps/socket-server/**/*.{ts,json}"
```

Expected: 全部 exit 0。

---

### Task 2: 广播器与自动轨迹模拟器

**Files:**

- Create: `apps/socket-server/src/broadcaster.ts`
- Create: `apps/socket-server/src/demo-simulator.ts`
- Create: `apps/socket-server/tests/broadcaster.test.ts`
- Create: `apps/socket-server/tests/demo-simulator.test.ts`

**Interfaces:**

- Consumes: `SocketTaskMessage` from `src/protocol.ts`
- Produces: `SocketBroadcaster.add(client)`、`.remove(client)`、`.broadcast(messages)`、`.clientCount`、`.closeAll()`
- Produces: `DemoSimulator.start()`、`.stop()`、`.running`
- Produces: `createPositionMessage(step, radius, durationMs): SocketTaskMessage`

- [ ] **Step 1: 先写广播器失败测试**

用最小 `WebSocketLike` 测试对象验证只向 `OPEN` 客户端发送、批量顺序不变、投递数等于消息数乘开放客户端数、关闭时清空注册表。

```ts
const broadcaster = new SocketBroadcaster();
broadcaster.add(openClient);
broadcaster.add(closedClient);
expect(broadcaster.broadcast([first, second])).toBe(2);
expect(openClient.sent).toEqual([
  JSON.stringify(first),
  JSON.stringify(second),
]);
```

- [ ] **Step 2: 运行测试并确认因广播器缺失而失败**

Run: `pnpm --filter @digital-twin/socket-server test -- broadcaster.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现最小广播器**

广播时重新检查 `readyState === WebSocket.OPEN`。单个发送失败不阻断其他客户端，失败客户端从注册表移除并返回成功投递次数。`closeAll()` 使用关闭码 1001 和原因 `server shutting down`。

- [ ] **Step 4: 运行广播器测试并确认通过**

Run: `pnpm --filter @digital-twin/socket-server test -- broadcaster.test.ts`

Expected: PASS。

- [ ] **Step 5: 先写轨迹与定时器失败测试**

```ts
vi.useFakeTimers();
const simulator = new DemoSimulator({
  intervalMs: 1000,
  radius: 5,
  broadcast,
});
simulator.start();
expect(broadcast).toHaveBeenCalledTimes(1);
await vi.advanceTimersByTimeAsync(2000);
expect(broadcast).toHaveBeenCalledTimes(3);
```

同时验证重复 `start()` 不增加频率、`stop()` 后不发送、半径和 Y 坐标正确。

- [ ] **Step 6: 运行测试并确认因模拟器缺失而失败**

Run: `pnpm --filter @digital-twin/socket-server test -- demo-simulator.test.ts`

Expected: FAIL。

- [ ] **Step 7: 实现位置消息和幂等模拟器**

每步角度增加 `Math.PI / 12`，X/Z 组成闭合圆，Y 恒为 0；`start()` 立即发第一条，之后使用唯一 interval；`stop()` 清理 interval。

```ts
{
  taskCode: 'device-position',
  taskType: 'ModelPosition',
  taskTime: Math.min(intervalMs, 800),
  taskData: {
    x: radius * Math.cos(angle),
    y: 0,
    z: radius * Math.sin(angle),
  },
}
```

- [ ] **Step 8: 运行 Task 2 全部测试**

Run: `pnpm --filter @digital-twin/socket-server test`

Expected: PASS，fake timers 均被恢复。

---

### Task 3: HTTP/WebSocket 网络服务

**Files:**

- Create: `apps/socket-server/src/server.ts`
- Create: `apps/socket-server/tests/server.test.ts`

**Interfaces:**

- Consumes: `SocketServerConfig`、`parseBroadcastPayload`、`SocketBroadcaster`、`DemoSimulator`
- Produces: `createSocketServer(options): SocketServer`
- Produces: `SocketServer.start(): Promise<SocketServerAddress>` and `SocketServer.close(): Promise<void>`
- 直接构造服务时端口可为 0 以支持测试；环境配置仍拒绝端口 0。

- [ ] **Step 1: 先写真实网络集成失败测试**

在 `127.0.0.1:0` 启动服务，使用真实 `ws` 客户端和 `fetch` 覆盖健康接口、连接计数、单条/多客户端广播、批量顺序、非法输入、1 MiB 限制、404、CORS、心跳无回复、demo start/stop 和关闭释放端口。

```ts
const service = createSocketServer({
  host: '127.0.0.1',
  port: 0,
  demoIntervalMs: 20,
  demoRadius: 2,
});
const address = await service.start();
const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
await once(client, 'open');
```

- [ ] **Step 2: 运行集成测试并确认因服务缺失而失败**

Run: `pnpm --filter @digital-twin/socket-server test -- server.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现请求解析与统一 JSON 响应**

```ts
function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void;

function readJsonBody(
  request: IncomingMessage,
  maxBytes = 1024 * 1024,
): Promise<unknown>;
```

超过上限、空请求体和 JSON 解析错误统一映射为 400。

- [ ] **Step 4: 实现服务生命周期和路由**

- Upgrade 仅接受路径 `/`。
- 连接时注册客户端，`close/error` 时移除。
- 上行 `{"type":"ping"}` 静默忽略，其他上行消息仅记录 debug 日志。
- `GET /health` 返回 `status`、`clientCount`、`demoRunning` 和配置摘要。
- `POST /api/messages` 返回 `acceptedCount` 与 `deliveryCount`。
- demo start/stop 返回 `demoRunning`。
- 所有路由设置 `Access-Control-Allow-Origin: *`；`OPTIONS` 返回 204。
- `close()` 幂等，顺序关闭模拟器、客户端、WebSocketServer 和 HTTP Server。

- [ ] **Step 5: 运行集成测试并修到通过**

Run: `pnpm --filter @digital-twin/socket-server test -- server.test.ts`

Expected: PASS，无残留 handle 或未处理 rejection。

- [ ] **Step 6: 运行应用级完整验证**

```powershell
pnpm --filter @digital-twin/socket-server test
pnpm --filter @digital-twin/socket-server typecheck
pnpm --filter @digital-twin/socket-server build
```

Expected: 全部 exit 0。

---

### Task 4: 生产入口、统一启停和文档

**Files:**

- Create: `apps/socket-server/src/main.ts`
- Create: `apps/socket-server/tests/main.test.ts`
- Modify: `scripts/start-lan.ps1`
- Modify: `scripts/start-all.ps1`
- Modify: `scripts/stop-all.ps1`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**

- Consumes: `loadSocketServerConfig`、`createSocketServer`
- Produces: `runSocketServer(env, dependencies): Promise<SocketServer>`
- 生产入口安装 `SIGINT`/`SIGTERM` 处理器，启动失败设置 `process.exitCode = 1`

- [ ] **Step 1: 先写生产入口失败测试**

验证有效配置调用 `start()`，启动失败会向调用方抛出，关闭回调只执行一次并调用 `service.close()`。

```ts
const service = await runSocketServer(
  { SOCKET_PORT: '18080' },
  { createServer },
);
expect(createServer).toHaveBeenCalledWith(
  expect.objectContaining({ port: 18080 }),
);
expect(service.start).toHaveBeenCalledOnce();
```

- [ ] **Step 2: 运行入口测试并确认失败**

Run: `pnpm --filter @digital-twin/socket-server test -- main.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现入口和优雅关闭**

启动日志显示 HTTP 健康地址和 WebSocket 地址。生产入口只在模块作为程序直接执行时 bootstrap，避免测试 import 产生副作用。

- [ ] **Step 4: 更新统一启动和停止脚本**

`scripts/start-lan.ps1` 新增隐藏进程：

```powershell
$env:SOCKET_HOST = '0.0.0.0'
Start-Process -FilePath $node -ArgumentList @($tsx, 'watch', 'src/main.ts') `
  -WorkingDirectory (Join-Path $root 'apps\socket-server') -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $root 'socket.log') `
  -RedirectStandardError (Join-Path $root 'socket.err.log')
```

`scripts/start-all.ps1` 把 18080 加入端口占用和健康检查，启动后轮询 `/health`，并显示本地/LAN Socket 地址。`scripts/stop-all.ps1` 的输出文案包含 Socket 服务，且只匹配当前仓库的项目 Node 进程。

- [ ] **Step 5: 更新环境样例和 README**

`.env.example` 增加四个 `SOCKET_*` 变量。README 写明画布任务配置以及：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:18080/api/demo/start
Invoke-RestMethod -Method Post http://127.0.0.1:18080/api/messages `
  -ContentType 'application/json' `
  -Body '{"taskCode":"device-position","taskData":{"x":1,"y":0,"z":2}}'
```

- [ ] **Step 6: 运行入口与受影响范围验证**

```powershell
pnpm --filter @digital-twin/socket-server test
pnpm prettier --check "apps/socket-server/**/*.{ts,json}" scripts/start-lan.ps1 scripts/start-all.ps1 scripts/stop-all.ps1 .env.example README.md
pnpm eslint apps/socket-server
pnpm --filter @digital-twin/socket-server typecheck
pnpm --filter @digital-twin/socket-server build
```

Expected: 全部 exit 0。

---

### Task 5: 仓库回归与真实进程冒烟

**Files:**

- Modify only if verification exposes a Socket-feature regression; any correction must first add or strengthen a failing test in the owning task.

**Interfaces:**

- Consumes the completed `@digital-twin/socket-server` app and project scripts.
- Produces fresh verification evidence and no persistent test process.

- [ ] **Step 1: 运行受影响工作区和仓库静态验证**

```powershell
pnpm --filter @digital-twin/socket-server test
pnpm --filter @digital-twin/socket-server typecheck
pnpm --filter @digital-twin/socket-server build
pnpm format:check
pnpm lint
pnpm typecheck
```

Expected: 全部 exit 0。若发现与 Socket 改动无关的既有失败，记录原始输出并只验证受影响范围，不修改无关代码。

- [ ] **Step 2: 启动真实构建产物**

启动前确认端口 18080 未被其他进程占用。使用独立进程启动 `node apps/socket-server/dist/main.js`，记录 PID，并轮询 `http://127.0.0.1:18080/health`。

- [ ] **Step 3: 执行端到端消息冒烟**

临时 Node 脚本连接 WebSocket，调用消息接口，断言收到相同任务；再启动 demo、断言收到自动消息、停止 demo，并确认连接时 `clientCount=1`。

- [ ] **Step 4: 优雅关闭并确认资源释放**

只停止本步骤记录 PID 的 Socket 进程，随后运行：

```powershell
Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue
```

Expected: 无监听结果。

- [ ] **Step 5: 审查最终差异和需求覆盖**

```powershell
git status --short
git diff --check
git diff --stat
```

逐项对照设计文档第 9 节。确认没有把 `.env`、日志、凭据或用户绝对路径加入变更。未经用户新的明确授权，不提交或推送本次改动。
