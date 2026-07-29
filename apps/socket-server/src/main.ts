import { pathToFileURL } from 'node:url';
import { loadSocketServerConfig } from './config.js';
import {
  createSocketServer,
  type SocketServer,
  type SocketServerAddress,
  type SocketServerOptions,
} from './server.js';

export type SocketServerFactory = (
  options: SocketServerOptions,
) => SocketServer;

export interface RunSocketServerDependencies {
  createServer: SocketServerFactory;
  log(message: string): void;
}

export interface RunningSocketServer {
  service: SocketServer;
  address: SocketServerAddress;
}

const defaultDependencies: RunSocketServerDependencies = {
  createServer: createSocketServer,
  log: (message) => console.log(message),
};

export async function runSocketServer(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RunSocketServerDependencies = defaultDependencies,
): Promise<RunningSocketServer> {
  const config = loadSocketServerConfig(env);
  const service = dependencies.createServer(config);
  const address = await service.start();
  const displayHost = config.host === '0.0.0.0' ? '0.0.0.0' : address.host;
  dependencies.log(
    `Socket simulator listening: ws://${displayHost}:${address.port} (health: http://${displayHost}:${address.port}/health)`,
  );
  return { service, address };
}

function installShutdownHandlers(service: SocketServer): void {
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await service.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

async function bootstrap(): Promise<void> {
  const running = await runSocketServer();
  installShutdownHandlers(running.service);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
