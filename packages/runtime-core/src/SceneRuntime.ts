import type {
  InteractionDefinition,
  SceneDocument,
} from '@digital-twin/scene-schema';
import { ActionRunner } from './actions/ActionRunner.js';
import { evaluateConditionGroup } from './conditions/evaluateConditions.js';
import { WebSocketRuntime } from './socket/WebSocketRuntime.js';
import {
  createDiagnostic,
  type RuntimeDiagnosticListener,
  type RuntimeHost,
  type RuntimeNodeEvent,
  type RuntimeTriggerEvent,
} from './types.js';
import type {
  SocketTaskExecution,
  WebSocketFactory,
  WebSocketStatus,
} from './socket/types.js';

export interface SceneRuntimeOptions {
  host: RuntimeHost;
  onDiagnostic?: RuntimeDiagnosticListener;
  onInteractionSettled?: (
    interaction: InteractionDefinition,
    event: RuntimeTriggerEvent,
  ) => void;
  createSocket?: WebSocketFactory;
  onSocketStatus?: (dataSourceId: string, status: WebSocketStatus) => void;
  onSocketTask?: (execution: SocketTaskExecution) => void;
}

const NODE_TRIGGER_TYPES = new Set<RuntimeNodeEvent>([
  'click',
  'double-click',
  'pointer-enter',
  'pointer-leave',
]);

/** 管理单份 SceneDocument 的触发器、变量、动作取消和事件订阅。 */
export class SceneRuntime {
  private readonly variables = new Map<string, unknown>();
  private readonly subscriptions = new Set<() => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly controllers = new Set<AbortController>();
  private readonly pending = new Set<Promise<void>>();
  private readonly actionRunner: ActionRunner;
  private webSocketRuntime?: WebSocketRuntime;
  private document?: SceneDocument;
  private started = false;
  private disposed = false;

  constructor(private readonly options: SceneRuntimeOptions) {
    this.actionRunner = new ActionRunner(options.host, options.onDiagnostic);
  }

  load(document: SceneDocument): void {
    if (this.disposed) throw new Error('已销毁的 SceneRuntime 不能重新加载');
    this.stopActiveLifecycle();
    this.document = document;
    this.variables.clear();
  }

  start(): void {
    if (this.disposed) return;
    if (!this.document) throw new Error('SceneRuntime 尚未加载场景文档');
    if (this.started) return;
    this.started = true;

    for (const interaction of this.document.interactions) {
      if (!interaction.enabled) continue;
      const type = interaction.trigger.type;
      if (NODE_TRIGGER_TYPES.has(type as RuntimeNodeEvent)) {
        const unsubscribe = this.options.host.subscribeNodeEvent(
          interaction.sourceNodeId,
          type as RuntimeNodeEvent,
          () => {
            this.track(
              this.executeInteraction(interaction, {
                type,
                sourceNodeId: interaction.sourceNodeId,
              }),
            );
          },
        );
        this.subscriptions.add(unsubscribe);
      } else if (type === 'timer') {
        this.scheduleTimer(interaction);
      }
    }
    if (this.options.createSocket) {
      this.webSocketRuntime = new WebSocketRuntime({
        host: this.options.host,
        createSocket: this.options.createSocket,
        onDiagnostic: this.options.onDiagnostic,
        onStatus: this.options.onSocketStatus,
        onTask: (execution) => {
          this.options.onSocketTask?.(execution);
          this.track(
            this.emitTrigger({
              type: 'websocket',
              dataSourceId: execution.dataSourceId,
              taskCode: execution.taskCode,
              message: execution.message,
            }),
          );
        },
      });
      this.webSocketRuntime.start(this.document);
    }
    this.track(this.emitTrigger({ type: 'scene-load' }));
  }

  async emitTrigger(event: RuntimeTriggerEvent): Promise<void> {
    if (!this.started || this.disposed || !this.document) return;
    const matching = this.document.interactions.filter(
      (interaction) => interaction.enabled && this.matches(interaction, event),
    );
    await Promise.all(
      matching.map((interaction) =>
        this.executeInteraction(interaction, event),
      ),
    );
  }

  setVariable(key: string, value: unknown): void {
    const before = this.variables.get(key);
    if (Object.is(before, value)) return;
    this.variables.set(key, value);
    if (this.started) {
      this.track(
        this.emitTrigger({
          type: 'variable-change',
          variableKey: key,
          message: { before, value },
        }),
      );
    }
  }

  getVariable(key: string): unknown {
    return this.variables.get(key);
  }

  injectSocketMessage(dataSourceId: string, payload: unknown): Promise<void> {
    return (
      this.webSocketRuntime?.injectMessage(dataSourceId, payload) ??
      Promise.resolve()
    );
  }

  /** 等待当前已触发动作全部收敛，预览切场景和测试均可用它建立明确边界。 */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopActiveLifecycle();
    this.document = undefined;
    this.variables.clear();
  }

  private async executeInteraction(
    interaction: InteractionDefinition,
    event: RuntimeTriggerEvent,
  ): Promise<void> {
    if (this.disposed) return;
    const variables = Object.fromEntries(this.variables);
    const allowed = evaluateConditionGroup(interaction.conditions, {
      variables,
      message: event.message,
      isNodeVisible: (nodeId) => this.options.host.isNodeVisible(nodeId),
      onDiagnostic: this.options.onDiagnostic,
    });
    if (!allowed) return;

    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      await this.actionRunner.run(
        interaction.actions,
        interaction.execution,
        {
          getVariable: (key) => this.getVariable(key),
          setVariable: (key, value) => this.setVariable(key, value),
        },
        controller.signal,
      );
      // 仅通知仍属于当前文档代次的交互，避免销毁后的晚到动作刷新新页面状态。
      if (!this.disposed && !controller.signal.aborted) {
        this.options.onInteractionSettled?.(interaction, event);
      }
    } catch (error) {
      this.options.onDiagnostic?.(
        createDiagnostic({
          level: 'error',
          source: 'interaction',
          message: `交互执行失败: ${interaction.name}`,
          detail: error,
        }),
      );
    } finally {
      this.controllers.delete(controller);
    }
  }

  private matches(
    interaction: InteractionDefinition,
    event: RuntimeTriggerEvent,
  ): boolean {
    const trigger = interaction.trigger;
    if (trigger.type !== event.type) return false;
    if (NODE_TRIGGER_TYPES.has(trigger.type as RuntimeNodeEvent)) {
      return interaction.sourceNodeId === event.sourceNodeId;
    }
    if (trigger.type === 'variable-change') {
      return trigger.key === event.variableKey;
    }
    if (trigger.type === 'websocket') {
      return (
        trigger.dataSourceId === event.dataSourceId &&
        (!trigger.taskCode || trigger.taskCode === event.taskCode)
      );
    }
    if (trigger.type === 'animation-end') {
      return trigger.nodeId === event.sourceNodeId;
    }
    return true;
  }

  private scheduleTimer(interaction: InteractionDefinition): void {
    if (interaction.trigger.type !== 'timer') return;
    const trigger = interaction.trigger;
    const invoke = (): void => {
      if (!this.started || this.disposed) return;
      this.track(this.executeInteraction(interaction, { type: 'timer' }));
    };
    const initial = setTimeout(() => {
      this.timers.delete(initial);
      invoke();
      if (trigger.intervalMs) {
        const interval = setInterval(invoke, trigger.intervalMs);
        this.timers.add(interval);
      }
    }, trigger.delayMs);
    this.timers.add(initial);
  }

  private track(promise: Promise<void>): void {
    this.pending.add(promise);
    void promise.finally(() => this.pending.delete(promise));
  }

  private stopActiveLifecycle(): void {
    this.started = false;
    this.webSocketRuntime?.stop();
    this.webSocketRuntime = undefined;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions.clear();
    for (const timer of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.timers.clear();
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}
