import type { DataSourceDefinition } from '@digital-twin/scene-schema';
import { createDiagnostic, type RuntimeDiagnosticListener } from '../types.js';
import type {
  WebSocketEventMap,
  WebSocketFactory,
  WebSocketLike,
  WebSocketStatus,
} from './types.js';

const OPEN_STATE = 1;
const MAX_RECONNECT_DELAY = 30_000;

/** 单个数据源的连接状态机，旧连接事件通过 generation 隔离。 */
export class WebSocketConnection {
  private readonly statusListeners = new Set<
    (status: WebSocketStatus) => void
  >();
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private socket?: WebSocketLike;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private detachCurrent?: () => void;
  private generation = 0;
  private reconnectAttempt = 0;
  private desiredOpen = false;
  private currentStatus: WebSocketStatus = 'idle';

  constructor(
    private readonly dataSource: DataSourceDefinition,
    private readonly createSocket: WebSocketFactory,
    private readonly onDiagnostic?: RuntimeDiagnosticListener,
  ) {}

  get status(): WebSocketStatus {
    return this.currentStatus;
  }

  connect(): void {
    if (this.desiredOpen && this.socket) return;
    this.desiredOpen = true;
    this.reconnectAttempt = 0;
    this.clearTimers();
    this.openSocket(false);
  }

  disconnect(): void {
    this.desiredOpen = false;
    this.generation += 1;
    this.clearTimers();
    const socket = this.socket;
    this.socket = undefined;
    this.detachCurrent?.();
    this.detachCurrent = undefined;
    socket?.close(1000, 'scene runtime disposed');
    this.setStatus('closed');
  }

  subscribeStatus(listener: (status: WebSocketStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  subscribeMessage(listener: (message: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private openSocket(reconnecting: boolean): void {
    if (!this.desiredOpen) return;
    const generation = ++this.generation;
    const socket = this.createSocket(this.dataSource.url);
    this.socket = socket;
    this.setStatus(reconnecting ? 'reconnecting' : 'connecting');

    const active = (): boolean =>
      this.desiredOpen &&
      this.generation === generation &&
      this.socket === socket;
    const onOpen = (): void => {
      if (!active()) return;
      this.reconnectAttempt = 0;
      this.setStatus('open');
      this.startHeartbeat(socket, generation);
    };
    const onMessage = (event: WebSocketEventMap['message']): void => {
      if (!active()) return;
      for (const listener of this.messageListeners) listener(event.data);
    };
    const onError = (event: WebSocketEventMap['error']): void => {
      if (!active()) return;
      this.setStatus('error');
      this.onDiagnostic?.(
        createDiagnostic({
          level: 'warning',
          source: 'socket',
          message: `WebSocket 连接异常: ${this.dataSource.name}`,
          detail: event.error,
        }),
      );
    };
    const onClose = (event: WebSocketEventMap['close']): void => {
      if (!active()) return;
      this.stopHeartbeat();
      this.socket = undefined;
      this.detachCurrent?.();
      this.detachCurrent = undefined;
      if (!this.desiredOpen) {
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect(event);
    };

    socket.addEventListener('open', onOpen);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
    this.detachCurrent = () =>
      this.detach(socket, onOpen, onMessage, onError, onClose);
  }

  private scheduleReconnect(event: WebSocketEventMap['close']): void {
    if (this.reconnectAttempt >= this.dataSource.reconnectLimit) {
      this.desiredOpen = false;
      this.setStatus('closed');
      this.onDiagnostic?.(
        createDiagnostic({
          level: 'error',
          source: 'socket',
          message: `WebSocket 已达到重连上限: ${this.dataSource.name}`,
          detail: event,
        }),
      );
      return;
    }
    const baseDelay = this.dataSource.reconnectBaseDelayMs ?? 1_000;
    const delay = Math.min(
      baseDelay * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY,
    );
    this.reconnectAttempt += 1;
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket(true);
    }, delay);
  }

  private startHeartbeat(socket: WebSocketLike, generation: number): void {
    this.stopHeartbeat();
    const payload = JSON.stringify(
      this.dataSource.heartbeatPayload ?? { type: 'ping' },
    );
    this.heartbeatTimer = setInterval(() => {
      if (
        this.desiredOpen &&
        this.generation === generation &&
        socket.readyState === OPEN_STATE
      ) {
        socket.send(payload);
      }
    }, this.dataSource.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.stopHeartbeat();
  }

  private setStatus(status: WebSocketStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private detach(
    socket: WebSocketLike,
    onOpen: (event: WebSocketEventMap['open']) => void,
    onMessage: (event: WebSocketEventMap['message']) => void,
    onError: (event: WebSocketEventMap['error']) => void,
    onClose: (event: WebSocketEventMap['close']) => void,
  ): void {
    socket.removeEventListener('open', onOpen);
    socket.removeEventListener('message', onMessage);
    socket.removeEventListener('error', onError);
    socket.removeEventListener('close', onClose);
  }
}
