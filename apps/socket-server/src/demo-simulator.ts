import type { SocketTaskMessage } from './protocol.js';

const STEP_ANGLE = Math.PI / 12;

export function createPositionMessage(
  step: number,
  radius: number,
  durationMs: number,
): SocketTaskMessage {
  const angle = (step % 24) * STEP_ANGLE;
  return {
    taskCode: 'device-position',
    taskType: 'ModelPosition',
    taskTime: durationMs,
    taskData: {
      x: radius * Math.cos(angle),
      y: 0,
      z: radius * Math.sin(angle),
    },
  };
}

export interface DemoSimulatorOptions {
  intervalMs: number;
  radius: number;
  broadcast(messages: SocketTaskMessage[]): void;
}

export class DemoSimulator {
  private timer?: ReturnType<typeof setInterval>;
  private step = 0;

  constructor(private readonly options: DemoSimulatorOptions) {}

  get running(): boolean {
    return this.timer !== undefined;
  }

  start(): boolean {
    if (this.timer !== undefined) return false;
    this.emitPosition();
    this.timer = setInterval(
      () => this.emitPosition(),
      this.options.intervalMs,
    );
    return true;
  }

  stop(): boolean {
    if (this.timer === undefined) return false;
    clearInterval(this.timer);
    this.timer = undefined;
    return true;
  }

  private emitPosition(): void {
    this.options.broadcast([
      createPositionMessage(
        this.step,
        this.options.radius,
        Math.min(this.options.intervalMs, 800),
      ),
    ]);
    this.step = (this.step + 1) % 24;
  }
}
