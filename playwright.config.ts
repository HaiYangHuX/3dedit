import { defineConfig } from '@playwright/test';

const databaseE2E = process.env.E2E_DATABASE === 'true';
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/api';
const editorBaseUrl =
  process.env.E2E_EDITOR_BASE_URL ?? 'http://127.0.0.1:5173';
const runtimeBaseUrl =
  process.env.E2E_RUNTIME_BASE_URL ?? 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: editorBaseUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      // CI 没有物理 GPU，SwiftShader 仍能验证真实 WebGL 上下文与 Canvas 生命周期。
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-angle=swiftshader',
      ],
    },
  },
  webServer: [
    {
      command: `pnpm --filter @digital-twin/editor-web exec vite --host 0.0.0.0 --port ${new URL(editorBaseUrl).port || '5173'}`,
      url: `${editorBaseUrl}/projects`,
      // 真实数据库 E2E 需要注入独立 API 端口，不能复用不同 Vite 环境的旧进程。
      env: databaseE2E ? { VITE_API_BASE_URL: apiBaseUrl } : undefined,
      reuseExistingServer: !process.env.CI && !databaseE2E,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @digital-twin/runtime-web exec vite --host 0.0.0.0 --port ${new URL(runtimeBaseUrl).port || '5174'}`,
      url: `${runtimeBaseUrl}/runtime/local-publication`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    ...(databaseE2E
      ? [
          {
            command: 'sh infrastructure/scripts/start-e2e-backend.sh',
            url: `${apiBaseUrl}/health`,
            env: {
              PORT: new URL(apiBaseUrl).port || '3100',
            },
            reuseExistingServer: false,
            timeout: 120_000,
          },
        ]
      : []),
  ],
});
