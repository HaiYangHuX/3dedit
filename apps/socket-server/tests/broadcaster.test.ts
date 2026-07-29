import { describe, expect, it } from 'vitest';
import { SocketBroadcaster, type SocketClient } from '../src/broadcaster.js';
import type { SocketTaskMessage } from '../src/protocol.js';

class FakeClient implements SocketClient {
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];

  constructor(
    public readyState: number,
    private readonly sendError?: Error,
  ) {}

  send(data: string): void {
    if (this.sendError) throw this.sendError;
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }
}

describe('SocketBroadcaster', () => {
  const first: SocketTaskMessage = {
    taskCode: 'device-position',
    taskData: { x: 1, y: 0, z: 2 },
  };
  const second: SocketTaskMessage = {
    taskCode: 'device-visible',
    taskData: { visible: false },
  };

  it('sends every message in order only to open clients', () => {
    const broadcaster = new SocketBroadcaster();
    const openClient = new FakeClient(1);
    const closedClient = new FakeClient(3);
    broadcaster.add(openClient);
    broadcaster.add(closedClient);

    expect(broadcaster.broadcast([first, second])).toBe(2);
    expect(openClient.sent).toEqual([
      JSON.stringify(first),
      JSON.stringify(second),
    ]);
    expect(closedClient.sent).toEqual([]);
    expect(broadcaster.clientCount).toBe(1);
  });

  it('continues other deliveries after one client send fails', () => {
    const broadcaster = new SocketBroadcaster();
    const failingClient = new FakeClient(1, new Error('broken socket'));
    const healthyClient = new FakeClient(1);
    broadcaster.add(failingClient);
    broadcaster.add(healthyClient);

    expect(broadcaster.broadcast([first])).toBe(1);
    expect(healthyClient.sent).toEqual([JSON.stringify(first)]);
    expect(broadcaster.clientCount).toBe(1);
  });

  it('removes clients and closes all remaining connections', () => {
    const broadcaster = new SocketBroadcaster();
    const removedClient = new FakeClient(1);
    const activeClient = new FakeClient(1);
    broadcaster.add(removedClient);
    broadcaster.add(activeClient);
    broadcaster.remove(removedClient);

    broadcaster.closeAll();

    expect(removedClient.closed).toEqual([]);
    expect(activeClient.closed).toEqual([
      { code: 1001, reason: 'server shutting down' },
    ]);
    expect(broadcaster.clientCount).toBe(0);
  });
});
