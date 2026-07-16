import type {
  DataSourceDefinition,
  SocketTaskDefinition,
} from '@digital-twin/scene-schema';
import type { RuntimeDiagnosticListener, RuntimeHost } from '../types.js';
import { WebSocketConnection } from './WebSocketConnection.js';
import { SocketTaskRunner } from './SocketTaskRunner.js';
import type {
  SocketTaskExecution,
  WebSocketFactory,
  WebSocketStatus,
} from './types.js';

export interface WebSocketRuntimeOptions {
  host: RuntimeHost;
  createSocket: WebSocketFactory;
  onDiagnostic?: RuntimeDiagnosticListener;
  onStatus?: (dataSourceId: string, status: WebSocketStatus) => void;
  onTask?: (execution: SocketTaskExecution) => void;
}

export interface WebSocketRuntimeDocument {
  dataSources: DataSourceDefinition[];
  socketTasks: SocketTaskDefinition[];
}

/** 同时管理场景内多个数据源，并确保消息注入和真实连接走同一解析路径。 */
export class WebSocketRuntime {
  private readonly connections = new Map<string, WebSocketConnection>();
  private taskRunner?: SocketTaskRunner;

  constructor(private readonly options: WebSocketRuntimeOptions) {}

  start(document: WebSocketRuntimeDocument): void {
    this.stop();
    this.taskRunner = new SocketTaskRunner(
      document.socketTasks,
      this.options.host,
      this.options.onDiagnostic,
    );
    for (const source of document.dataSources) {
      if (!source.enabled) continue;
      const connection = new WebSocketConnection(
        source,
        this.options.createSocket,
        this.options.onDiagnostic,
      );
      connection.subscribeStatus((status) =>
        this.options.onStatus?.(source.id, status),
      );
      connection.subscribeMessage((message) => {
        void this.injectMessage(source.id, message);
      });
      this.connections.set(source.id, connection);
      if (source.autoConnect !== false) connection.connect();
    }
  }

  async injectMessage(dataSourceId: string, payload: unknown): Promise<void> {
    if (!this.taskRunner) return;
    let parsed = payload;
    if (typeof payload === 'string') {
      try {
        parsed = JSON.parse(payload) as unknown;
      } catch {
        await this.taskRunner.run(dataSourceId, payload);
        return;
      }
    }
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const message of messages) {
      const execution = await this.taskRunner.run(dataSourceId, message);
      if (execution) this.options.onTask?.(execution);
    }
  }

  connect(dataSourceId: string): void {
    this.connections.get(dataSourceId)?.connect();
  }

  stop(): void {
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
    this.taskRunner = undefined;
  }
}
