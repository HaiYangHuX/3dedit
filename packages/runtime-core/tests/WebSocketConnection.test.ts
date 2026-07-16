import type { DataSourceDefinition } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  WebSocketConnection,
  type WebSocketEventMap,
  type WebSocketLike,
} from '../src/index.js';

class MemorySocket implements WebSocketLike {
  readonly sent: string[] = [];
  readyState = 0;
  private readonly listeners = new Map<
    keyof WebSocketEventMap,
    Set<(event: never) => void>
  >();

  addEventListener<T extends keyof WebSocketEventMap>(
    type: T,
    listener: (event: WebSocketEventMap[T]) => void,
  ): void {
    const listeners =
      this.listeners.get(type) ?? new Set<(event: never) => void>();
    listeners.add(listener as (event: never) => void);
    this.listeners.set(type, listeners);
  }

  removeEventListener<T extends keyof WebSocketEventMap>(
    type: T,
    listener: (event: WebSocketEventMap[T]) => void,
  ): void {
    this.listeners.get(type)?.delete(listener as (event: never) => void);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce(
      (count, listeners) => count + listeners.size,
      0,
    );
  }

  emitOpen(): void {
    this.readyState = 1;
    this.emit('open', {});
  }

  emitClose(): void {
    this.readyState = 3;
    this.emit('close', { code: 1006, reason: 'fixture close' });
  }

  private emit<T extends keyof WebSocketEventMap>(
    type: T,
    event: WebSocketEventMap[T],
  ): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }
}

function dataSource(): DataSourceDefinition {
  return {
    id: 'socket-1',
    name: '设备数据',
    type: 'websocket',
    url: 'ws://127.0.0.1:18080',
    enabled: true,
    autoConnect: true,
    heartbeatMs: 100,
    heartbeatPayload: { type: 'heartbeat' },
    reconnectLimit: 3,
    reconnectBaseDelayMs: 1_000,
  };
}

describe('WebSocketConnection', () => {
  it('连续连接失败使用指数退避，open 后发送心跳并重置次数', async () => {
    vi.useFakeTimers();
    const sockets: MemorySocket[] = [];
    const connection = new WebSocketConnection(dataSource(), () => {
      const socket = new MemorySocket();
      sockets.push(socket);
      return socket;
    });

    connection.connect();
    expect(sockets).toHaveLength(1);
    sockets[0]?.emitClose();
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);

    sockets[1]?.emitClose();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);

    sockets[2]?.emitOpen();
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets[2]?.sent).toEqual(['{"type":"heartbeat"}']);
    expect(connection.status).toBe('open');
    connection.disconnect();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('主动断开后忽略旧连接 close 且不再重连', async () => {
    vi.useFakeTimers();
    const sockets: MemorySocket[] = [];
    const statuses: string[] = [];
    const connection = new WebSocketConnection(dataSource(), () => {
      const socket = new MemorySocket();
      sockets.push(socket);
      return socket;
    });
    connection.subscribeStatus((status) => statuses.push(status));

    connection.connect();
    connection.disconnect();
    expect(sockets[0]?.listenerCount).toBe(0);
    sockets[0]?.emitClose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets).toHaveLength(1);
    expect(connection.status).toBe('closed');
    expect(statuses.at(-1)).toBe('closed');
    vi.useRealTimers();
  });
});
