import type { SocketTaskType } from '@digital-twin/scene-schema';

export type WebSocketStatus =
  'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export interface WebSocketEventMap {
  open: Record<string, never>;
  message: { data: unknown };
  close: { code?: number; reason?: string };
  error: { error?: unknown };
}

/** 与浏览器 WebSocket 相交的最小接口，Node 测试不需要模拟完整 DOM 对象。 */
export interface WebSocketLike {
  readonly readyState: number;
  addEventListener<T extends keyof WebSocketEventMap>(
    type: T,
    listener: (event: WebSocketEventMap[T]) => void,
  ): void;
  removeEventListener<T extends keyof WebSocketEventMap>(
    type: T,
    listener: (event: WebSocketEventMap[T]) => void,
  ): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface SocketTaskMessage {
  taskCode: string;
  taskType?: SocketTaskType;
  taskTime?: number;
  taskData?: Record<string, unknown>;
}

export interface SocketTaskExecution {
  dataSourceId: string;
  taskCode: string;
  taskType: SocketTaskType;
  targetNodeId: string;
  message: SocketTaskMessage;
}
