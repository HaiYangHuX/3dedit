import type { ActionDefinition } from '@digital-twin/scene-schema';
import {
  createDiagnostic,
  type RuntimeActionContext,
  type RuntimeDiagnosticListener,
  type RuntimeHost,
  type RuntimeTransition,
} from '../types.js';

function transitionOf(action: {
  durationMs?: number;
  easing?: RuntimeTransition['easing'];
}): RuntimeTransition {
  return { durationMs: action.durationMs, easing: action.easing };
}

function wait(durationMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, durationMs);
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    }
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/** 将声明式 Action 映射到 RuntimeHost，并统一处理串并行、取消和诊断。 */
export class ActionRunner {
  constructor(
    private readonly host: RuntimeHost,
    private readonly onDiagnostic?: RuntimeDiagnosticListener,
  ) {}

  async run(
    actions: ActionDefinition[],
    execution: 'sequential' | 'parallel',
    context: RuntimeActionContext,
    signal?: AbortSignal,
  ): Promise<void> {
    if (execution === 'parallel') {
      await Promise.allSettled(
        actions.map((action) => this.runSafely(action, context, signal)),
      );
      return;
    }
    for (const action of actions) {
      if (signal?.aborted) return;
      const succeeded = await this.runSafely(action, context, signal);
      if (!succeeded) return;
    }
  }

  private async runSafely(
    action: ActionDefinition,
    context: RuntimeActionContext,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (signal?.aborted) return true;
    try {
      await this.runOne(action, context, signal);
      return true;
    } catch (error) {
      if (signal?.aborted) return true;
      this.onDiagnostic?.(
        createDiagnostic({
          level: 'error',
          source: 'action',
          message: `动作执行失败: ${action.type}`,
          detail: error,
        }),
      );
      return false;
    }
  }

  private async runOne(
    action: ActionDefinition,
    context: RuntimeActionContext,
    signal?: AbortSignal,
  ): Promise<void> {
    switch (action.type) {
      case 'set-visibility':
        await this.host.setVisibility(action.nodeId, action.visible);
        return;
      case 'toggle-visibility':
        await this.host.setVisibility(
          action.nodeId,
          !this.host.isNodeVisible(action.nodeId),
        );
        return;
      case 'set-transform':
        await this.host.setTransform(
          action.nodeId,
          action.transform,
          transitionOf(action),
          signal,
        );
        return;
      case 'set-color':
        await this.host.setColor(action.nodeId, action.color);
        return;
      case 'set-highlight':
        await this.host.setHighlight(action.nodeId, action.highlighted);
        return;
      case 'control-animation': {
        const { type: _type, nodeId, ...command } = action;
        await this.host.controlAnimation(nodeId, command);
        return;
      }
      case 'control-video': {
        const { type: _type, nodeId, ...command } = action;
        await this.host.controlVideo(nodeId, command);
        return;
      }
      case 'set-text':
        await this.host.setText(action.nodeId, action.text);
        return;
      case 'set-chart-data':
        await this.host.setChartData(action.nodeId, action.data);
        return;
      case 'focus-node':
        await this.host.focusNode(action.nodeId, transitionOf(action), signal);
        return;
      case 'switch-scene':
        await this.host.switchScene(action.sceneId);
        return;
      case 'open-link':
        await this.host.openLink(action.url, action.target ?? '_blank');
        return;
      case 'open-popup':
        await this.host.openPopup(action.name, action.payload);
        return;
      case 'set-variable':
        context.setVariable(action.key, action.value);
        return;
      case 'delay':
        await wait(action.durationMs, signal);
        return;
    }
  }
}
