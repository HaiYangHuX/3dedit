import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { ZodError } from 'zod';
import { WebSocketServer } from 'ws';
import { SocketBroadcaster } from './broadcaster.js';
import { DemoSimulator } from './demo-simulator.js';
import { parseBroadcastPayload } from './protocol.js';

const MAX_BODY_BYTES = 1024 * 1024;
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export interface SocketServerOptions {
  host: string;
  port: number;
  demoIntervalMs: number;
  demoRadius: number;
}

export interface SocketServerAddress {
  host: string;
  port: number;
}

export interface SocketServer {
  start(): Promise<SocketServerAddress>;
  close(): Promise<void>;
}

class RequestError extends Error {}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    ...CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(
  request: IncomingMessage,
  maxBytes = MAX_BODY_BYTES,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    request.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(new RequestError('JSON 请求体超过 1 MiB'));
        return;
      }
      if (chunks.length === 0) {
        reject(new RequestError('JSON 请求体不能为空'));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch {
        reject(new RequestError('JSON 格式无效'));
      }
    });
    request.on('aborted', () => reject(new RequestError('请求已中止')));
    request.on('error', reject);
  });
}

class SocketServerImpl implements SocketServer {
  private readonly broadcaster = new SocketBroadcaster();
  private readonly demo: DemoSimulator;
  private readonly webSocketServer = new WebSocketServer({ noServer: true });
  private readonly httpServer: Server;
  private address?: SocketServerAddress;
  private closePromise?: Promise<void>;

  constructor(private readonly options: SocketServerOptions) {
    this.demo = new DemoSimulator({
      intervalMs: options.demoIntervalMs,
      radius: options.demoRadius,
      broadcast: (messages) => {
        this.broadcaster.broadcast(messages);
      },
    });
    this.httpServer = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.httpServer.on('upgrade', (request, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });
    this.webSocketServer.on('connection', (client) => {
      this.broadcaster.add(client);
      const remove = (): void => this.broadcaster.remove(client);
      client.on('close', remove);
      client.on('error', remove);
      client.on('message', () => {
        // 画布会上行 {"type":"ping"} 心跳；模拟服务只负责下行任务，因此不回复业务消息。
      });
    });
  }

  async start(): Promise<SocketServerAddress> {
    if (this.address) return this.address;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        this.httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        this.httpServer.off('error', onError);
        resolve();
      };
      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListening);
      this.httpServer.listen(this.options.port, this.options.host);
    });
    const bound = this.httpServer.address();
    if (!bound || typeof bound === 'string') {
      throw new Error('Socket 服务没有可用的 TCP 监听地址');
    }
    this.address = {
      host: (bound as AddressInfo).address,
      port: (bound as AddressInfo).port,
    };
    return this.address;
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = this.closeResources();
    return this.closePromise;
  }

  private async closeResources(): Promise<void> {
    this.demo.stop();
    this.broadcaster.closeAll();
    for (const client of this.webSocketServer.clients) client.terminate();
    await Promise.all([this.closeWebSocketServer(), this.closeHttpServer()]);
    this.address = undefined;
  }

  private closeWebSocketServer(): Promise<void> {
    return new Promise((resolve) => {
      this.webSocketServer.close(() => resolve());
    });
  }

  private closeHttpServer(): Promise<void> {
    if (!this.httpServer.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== '/') {
      socket.destroy();
      return;
    }
    this.webSocketServer.handleUpgrade(request, socket, head, (client) => {
      this.webSocketServer.emit('connection', client, request);
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, CORS_HEADERS);
        response.end();
        return;
      }
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/health') {
        sendJson(response, 200, {
          status: 'ok',
          clientCount: this.broadcaster.clientCount,
          demoRunning: this.demo.running,
          config: {
            host: this.options.host,
            port: this.address?.port ?? this.options.port,
            demoIntervalMs: this.options.demoIntervalMs,
            demoRadius: this.options.demoRadius,
          },
        });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/messages') {
        const messages = parseBroadcastPayload(await readJsonBody(request));
        const deliveryCount = this.broadcaster.broadcast(messages);
        sendJson(response, 200, {
          acceptedCount: messages.length,
          deliveryCount,
        });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/demo/start') {
        const changed = this.demo.start();
        sendJson(response, 200, { demoRunning: this.demo.running, changed });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/demo/stop') {
        const changed = this.demo.stop();
        sendJson(response, 200, { demoRunning: this.demo.running, changed });
        return;
      }
      sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof RequestError || error instanceof ZodError) {
        sendJson(response, 400, {
          error: 'invalid_request',
          message: error.message,
        });
        return;
      }
      sendJson(response, 500, { error: 'internal_error' });
    }
  }
}

export function createSocketServer(options: SocketServerOptions): SocketServer {
  return new SocketServerImpl(options);
}
