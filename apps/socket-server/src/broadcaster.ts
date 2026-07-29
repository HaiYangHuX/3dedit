import type { SocketTaskMessage } from './protocol.js';

const OPEN_STATE = 1;

export interface SocketClient {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export class SocketBroadcaster {
  private readonly clients = new Set<SocketClient>();

  get clientCount(): number {
    return this.clients.size;
  }

  add(client: SocketClient): void {
    this.clients.add(client);
  }

  remove(client: SocketClient): void {
    this.clients.delete(client);
  }

  broadcast(messages: SocketTaskMessage[]): number {
    let deliveryCount = 0;
    for (const client of [...this.clients]) {
      if (client.readyState !== OPEN_STATE) {
        this.clients.delete(client);
        continue;
      }
      try {
        for (const message of messages) {
          client.send(JSON.stringify(message));
          deliveryCount += 1;
        }
      } catch {
        this.clients.delete(client);
      }
    }
    return deliveryCount;
  }

  closeAll(): void {
    for (const client of this.clients) {
      client.close(1001, 'server shutting down');
    }
    this.clients.clear();
  }
}
