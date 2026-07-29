import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
let child: ChildProcess | undefined;

async function reserveFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a TCP test port');
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForHealth(port: number): Promise<unknown> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error(`Production server exited with code ${child?.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return (await response.json()) as unknown;
    } catch {
      // The process may still be loading its modules.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Production server did not become healthy');
}

afterEach(async () => {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => child?.once('exit', () => resolve()));
  child = undefined;
});

describe('compiled production entry', () => {
  it('starts with Node and serves the health endpoint', async () => {
    const port = await reserveFreePort();
    child = spawn(process.execPath, ['dist/main.js'], {
      cwd: appRoot,
      env: {
        ...process.env,
        SOCKET_HOST: '127.0.0.1',
        SOCKET_PORT: String(port),
      },
      stdio: 'ignore',
    });

    await expect(waitForHealth(port)).resolves.toMatchObject({
      status: 'ok',
      clientCount: 0,
      demoRunning: false,
    });
  });
});
