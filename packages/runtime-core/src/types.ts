import type {
  ActionDefinition,
  Transform,
  TriggerDefinition,
} from '@digital-twin/scene-schema';

export type RuntimeNodeEvent = Extract<
  TriggerDefinition['type'],
  'click' | 'double-click' | 'pointer-enter' | 'pointer-leave'
>;

export interface RuntimeTransition {
  durationMs?: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export type AnimationAction = Extract<
  ActionDefinition,
  { type: 'control-animation' }
>;
export type VideoAction = Extract<ActionDefinition, { type: 'control-video' }>;

/**
 * runtime-core 只面向这个端口编排动作，不感知 Three.js、Vue 或 DOM 的具体实现。
 * signal 用于场景切换时取消仍在执行的补间、相机和媒体动作。
 */
export interface RuntimeHost {
  isNodeVisible(nodeId: string): boolean;
  setVisibility(nodeId: string, visible: boolean): void | Promise<void>;
  setTransform(
    nodeId: string,
    transform: Partial<Transform>,
    transition?: RuntimeTransition,
    signal?: AbortSignal,
  ): void | Promise<void>;
  setColor(nodeId: string, color: string): void | Promise<void>;
  setHighlight(nodeId: string, highlighted: boolean): void | Promise<void>;
  focusNode(
    nodeId: string,
    transition?: RuntimeTransition,
    signal?: AbortSignal,
  ): void | Promise<void>;
  controlAnimation(
    nodeId: string,
    action: Omit<AnimationAction, 'type' | 'nodeId'>,
  ): void | Promise<void>;
  controlVideo(
    nodeId: string,
    action: Omit<VideoAction, 'type' | 'nodeId'>,
  ): void | Promise<void>;
  setText(nodeId: string, text: string): void | Promise<void>;
  setChartData(nodeId: string, data: unknown): void | Promise<void>;
  switchScene(sceneId: string): void | Promise<void>;
  openLink(url: string, target: '_self' | '_blank'): void | Promise<void>;
  openPopup(name: string, payload?: unknown): void | Promise<void>;
  subscribeNodeEvent(
    nodeId: string,
    event: RuntimeNodeEvent,
    listener: () => void,
  ): () => void;
}

export interface RuntimeDiagnostic {
  level: 'debug' | 'info' | 'warning' | 'error';
  source: 'condition' | 'action' | 'interaction' | 'socket' | 'runtime';
  message: string;
  timestamp: number;
  detail?: unknown;
}

export type RuntimeDiagnosticListener = (diagnostic: RuntimeDiagnostic) => void;

export interface RuntimeActionContext {
  getVariable(key: string): unknown;
  setVariable(key: string, value: unknown): void;
}

export interface RuntimeTriggerEvent {
  type:
    | TriggerDefinition['type']
    | 'socket-message'
    | 'animation-end'
    | 'region-enter'
    | 'region-leave';
  sourceNodeId?: string;
  dataSourceId?: string;
  taskCode?: string;
  variableKey?: string;
  message?: unknown;
}

export function createDiagnostic(
  input: Omit<RuntimeDiagnostic, 'timestamp'>,
): RuntimeDiagnostic {
  return { ...input, timestamp: Date.now() };
}
