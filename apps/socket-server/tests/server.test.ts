import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  createSocketServer,
  type SocketServer,
  type SocketServerAddress,
} from '../src/server.js';

function messageFrom(client: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for WebSocket message')),
      2_000,
    );
    client.once('message', (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as unknown);
    });
  });
}

async function waitForNoMessage(
  client: WebSocket,
  durationMs = 60,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onMessage = (): void => {
      clearTimeout(timeout);
      reject(new Error('Received an unexpected WebSocket message'));
    };
    const timeout = setTimeout(() => {
      client.off('message', onMessage);
      resolve();
    }, durationMs);
    client.once('message', onMessage);
  });
}

describe('SocketServer', () => {
  let service: SocketServer;
  let address: SocketServerAddress;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    service = createSocketServer({
      host: '127.0.0.1',
      port: 0,
      demoIntervalMs: 20,
      demoRadius: 2,
    });
    address = await service.start();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      if (client.readyState === WebSocket.OPEN) client.close();
    }
    await service.close();
  });

  async function openClient(): Promise<WebSocket> {
    const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
    clients.push(client);
    await once(client, 'open');
    return client;
  }

  function url(path: string): string {
    return `http://127.0.0.1:${address.port}${path}`;
  }

  it('reports health and live client count', async () => {
    const before = await fetch(url('/health'));
    expect(await before.json()).toMatchObject({
      status: 'ok',
      clientCount: 0,
      demoRunning: false,
      config: { demoIntervalMs: 20, demoRadius: 2 },
    });

    const client = await openClient();
    const connected = await fetch(url('/health'));
    expect(await connected.json()).toMatchObject({ clientCount: 1 });

    client.close();
    await once(client, 'close');
    // 客户端 close 事件可能早于服务端移除连接，按真实服务端状态轮询可避免竞态假失败。
    await viWaitFor(async () => {
      const disconnected = await fetch(url('/health'));
      expect(await disconnected.json()).toMatchObject({ clientCount: 0 });
    });
  });

  it('broadcasts a single message to every connected client', async () => {
    const firstClient = await openClient();
    const secondClient = await openClient();
    const firstReceived = messageFrom(firstClient);
    const secondReceived = messageFrom(secondClient);
    const message = {
      taskCode: 'device-position',
      taskData: { x: 1, y: 0, z: 2 },
    };

    const response = await fetch(url('/api/messages'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      acceptedCount: 1,
      deliveryCount: 2,
    });
    await expect(firstReceived).resolves.toEqual(message);
    await expect(secondReceived).resolves.toEqual(message);
  });

  it('keeps batch broadcast order', async () => {
    const client = await openClient();
    const received: unknown[] = [];
    client.on('message', (data) => {
      received.push(JSON.parse(data.toString()) as unknown);
    });
    const messages = [
      { taskCode: 'first', taskData: { visible: false } },
      { taskCode: 'second', taskData: { visible: true } },
    ];

    const response = await fetch(url('/api/messages'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(messages),
    });

    expect(await response.json()).toEqual({
      acceptedCount: 2,
      deliveryCount: 2,
    });
    await viWaitFor(() => expect(received).toEqual(messages));
  });

  it('rejects invalid input without broadcasting it', async () => {
    const client = await openClient();
    const response = await fetch(url('/api/messages'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskCode: '', taskData: [] }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
    await waitForNoMessage(client);
  });

  it('rejects malformed and oversized JSON bodies', async () => {
    const malformed = await fetch(url('/api/messages'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);

    const oversized = await fetch(url('/api/messages'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskCode: 'large',
        taskData: { value: 'x'.repeat(1_048_577) },
      }),
    });
    expect(oversized.status).toBe(400);
  });

  it('starts and stops automatic position messages idempotently', async () => {
    const client = await openClient();
    const firstMessage = messageFrom(client);

    const firstStart = await fetch(url('/api/demo/start'), { method: 'POST' });
    const secondStart = await fetch(url('/api/demo/start'), { method: 'POST' });

    expect(await firstStart.json()).toEqual({
      demoRunning: true,
      changed: true,
    });
    expect(await secondStart.json()).toEqual({
      demoRunning: true,
      changed: false,
    });
    await expect(firstMessage).resolves.toMatchObject({
      taskCode: 'device-position',
      taskType: 'ModelPosition',
      taskData: { y: 0 },
    });

    const stop = await fetch(url('/api/demo/stop'), { method: 'POST' });
    expect(await stop.json()).toEqual({ demoRunning: false, changed: true });
    await waitForNoMessage(client, 50);
  });

  it('ignores client heartbeat messages', async () => {
    const client = await openClient();
    client.send(JSON.stringify({ type: 'ping' }));
    await waitForNoMessage(client);
  });

  it('supports CORS preflight and returns JSON 404 responses', async () => {
    const options = await fetch(url('/api/messages'), { method: 'OPTIONS' });
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-origin')).toBe('*');

    const missing = await fetch(url('/missing'));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not_found' });
  });

  it('releases the listening address when closed twice', async () => {
    await service.close();
    await service.close();

    const replacement = createSocketServer({
      host: '127.0.0.1',
      port: address.port,
      demoIntervalMs: 20,
      demoRadius: 2,
    });
    await expect(replacement.start()).resolves.toMatchObject({
      port: address.port,
    });
    await replacement.close();
  });
});

async function viWaitFor(assertion: () => void | Promise<void>): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (true) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
