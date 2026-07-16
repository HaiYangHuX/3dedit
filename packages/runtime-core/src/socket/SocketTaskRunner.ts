import {
  socketTaskTypeSchema,
  type SocketTaskDefinition,
  type SocketTaskType,
} from '@digital-twin/scene-schema';
import {
  createDiagnostic,
  type RuntimeDiagnosticListener,
  type RuntimeHost,
} from '../types.js';
import type { SocketTaskExecution, SocketTaskMessage } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function vectorFrom(data: Record<string, unknown>): [number, number, number] {
  const { x, y, z } = data;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    throw new Error('x、y、z 必须为有限数字');
  }
  return [x, y, z];
}

/** 按 taskCode 查找配置，并把参考项目的任务语义映射到 RuntimeHost。 */
export class SocketTaskRunner {
  constructor(
    private readonly tasks: SocketTaskDefinition[],
    private readonly host: RuntimeHost,
    private readonly onDiagnostic?: RuntimeDiagnosticListener,
  ) {}

  async run(
    dataSourceId: string,
    input: unknown,
  ): Promise<SocketTaskExecution | undefined> {
    const message = this.parseMessage(input);
    if (!message) return undefined;
    const task = this.tasks.find(
      (candidate) =>
        candidate.dataSourceId === dataSourceId &&
        candidate.taskCode === message.taskCode,
    );
    if (!task) {
      this.warn(`未找到 Socket 任务: ${message.taskCode}`);
      return undefined;
    }

    const taskType = message.taskType ?? task.taskType;
    const parsedType = socketTaskTypeSchema.safeParse(taskType);
    if (!parsedType.success) {
      this.warn(`不支持的 Socket taskType: ${String(taskType)}`);
      return undefined;
    }
    const taskTime = message.taskTime ?? task.taskTime;
    const taskData = { ...task.taskData, ...message.taskData };
    if (
      !Number.isFinite(taskTime) ||
      taskTime < 0 ||
      !Number.isInteger(taskTime)
    ) {
      this.warn(`Socket taskTime 无效: ${String(taskTime)}`);
      return undefined;
    }

    try {
      await this.execute(
        parsedType.data,
        task.targetNodeId,
        taskTime,
        taskData,
      );
    } catch (error) {
      this.warn(`Socket 任务数据无效: ${message.taskCode}`, error);
      return undefined;
    }
    return {
      dataSourceId,
      taskCode: message.taskCode,
      taskType: parsedType.data,
      targetNodeId: task.targetNodeId,
      message,
    };
  }

  private parseMessage(input: unknown): SocketTaskMessage | undefined {
    if (!isRecord(input) || typeof input.taskCode !== 'string') {
      this.warn('Socket 消息缺少字符串 taskCode', input);
      return undefined;
    }
    if (input.taskData !== undefined && !isRecord(input.taskData)) {
      this.warn(`Socket taskData 必须是对象: ${input.taskCode}`);
      return undefined;
    }
    return {
      taskCode: input.taskCode,
      taskType: input.taskType as SocketTaskType | undefined,
      taskTime: typeof input.taskTime === 'number' ? input.taskTime : undefined,
      taskData: input.taskData,
    };
  }

  private async execute(
    type: SocketTaskType,
    nodeId: string,
    durationMs: number,
    data: Record<string, unknown>,
  ): Promise<void> {
    const transition = { durationMs, easing: 'linear' as const };
    switch (type) {
      case 'ModelPosition':
        await this.host.setTransform(
          nodeId,
          { position: vectorFrom(data) },
          transition,
        );
        return;
      case 'ModelRotation':
        await this.host.setTransform(
          nodeId,
          { rotation: vectorFrom(data) },
          transition,
        );
        return;
      case 'ModelScale':
        await this.host.setTransform(
          nodeId,
          { scale: vectorFrom(data) },
          transition,
        );
        return;
      case 'ModelVisible':
        if (typeof data.visible !== 'boolean') {
          throw new Error('visible 必须为 boolean');
        }
        await this.host.setVisibility(nodeId, data.visible);
        return;
      case 'ModelColor':
        if (typeof data.color !== 'string') {
          throw new Error('color 必须为字符串');
        }
        await this.host.setColor(nodeId, data.color);
        return;
      case 'TextUpdate':
        if (typeof data.text !== 'string') {
          throw new Error('text 必须为字符串');
        }
        await this.host.setText(nodeId, data.text);
        return;
      case 'ChartUpdate':
        await this.host.setChartData(nodeId, data.data ?? data);
        return;
      case 'VideoControl': {
        const command = data.command;
        if (!['play', 'pause', 'toggle', 'seek'].includes(String(command))) {
          throw new Error('视频 command 无效');
        }
        await this.host.controlVideo(nodeId, {
          command: command as 'play' | 'pause' | 'toggle' | 'seek',
          currentTime:
            typeof data.currentTime === 'number' ? data.currentTime : undefined,
        });
        return;
      }
      case 'AnimationControl': {
        const command = data.command;
        if (!['play', 'pause', 'toggle', 'stop'].includes(String(command))) {
          throw new Error('动画 command 无效');
        }
        await this.host.controlAnimation(nodeId, {
          command: command as 'play' | 'pause' | 'toggle' | 'stop',
          clip: typeof data.clip === 'string' ? data.clip : undefined,
          speed: typeof data.speed === 'number' ? data.speed : undefined,
          loop: typeof data.loop === 'boolean' ? data.loop : undefined,
        });
        return;
      }
      case 'CameraMove':
        await this.host.focusNode(nodeId, transition);
        return;
    }
  }

  private warn(message: string, detail?: unknown): void {
    this.onDiagnostic?.(
      createDiagnostic({
        level: 'warning',
        source: 'socket',
        message,
        detail,
      }),
    );
  }
}
