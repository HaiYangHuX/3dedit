import { describe, expect, it, vi } from 'vitest';
import { runSocketServer, type SocketServerFactory } from '../src/main.js';
import type {
  SocketServer,
  SocketServerAddress,
  SocketServerOptions,
} from '../src/server.js';

class FakeSocketServer implements SocketServer {
  startCount = 0;
  closeCount = 0;

  async start(): Promise<SocketServerAddress> {
    this.startCount += 1;
    return { host: '127.0.0.1', port: 18_080 };
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

describe('runSocketServer', () => {
  it('validates configuration and starts the created service', async () => {
    const fakeService = new FakeSocketServer();
    let receivedOptions: SocketServerOptions | undefined;
    const createServer: SocketServerFactory = (options) => {
      receivedOptions = options;
      return fakeService;
    };
    const log = vi.fn();

    const running = await runSocketServer(
      {
        SOCKET_HOST: '127.0.0.1',
        SOCKET_PORT: '18080',
        SOCKET_DEMO_INTERVAL_MS: '500',
        SOCKET_DEMO_RADIUS: '3',
      },
      { createServer, log },
    );

    expect(receivedOptions).toEqual({
      host: '127.0.0.1',
      port: 18_080,
      demoIntervalMs: 500,
      demoRadius: 3,
    });
    expect(fakeService.startCount).toBe(1);
    expect(running.service).toBe(fakeService);
    expect(running.address).toEqual({ host: '127.0.0.1', port: 18_080 });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('ws://127.0.0.1:18080'),
    );
  });

  it('rejects invalid environment configuration before creating a server', async () => {
    let createCount = 0;
    const createServer: SocketServerFactory = () => {
      createCount += 1;
      return new FakeSocketServer();
    };

    await expect(
      runSocketServer(
        { SOCKET_PORT: '0' },
        { createServer, log: () => undefined },
      ),
    ).rejects.toThrow();
    expect(createCount).toBe(0);
  });
});
