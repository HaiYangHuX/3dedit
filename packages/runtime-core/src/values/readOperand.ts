import type { RuntimeOperand } from '@digital-twin/scene-schema';
import { createDiagnostic, type RuntimeDiagnosticListener } from '../types.js';

const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

export interface RuntimeValueContext {
  variables: Readonly<Record<string, unknown>>;
  message?: unknown;
  isNodeVisible(nodeId: string): boolean;
  onDiagnostic?: RuntimeDiagnosticListener;
}

function readMessagePath(
  message: unknown,
  path: string | undefined,
  onDiagnostic?: RuntimeDiagnosticListener,
): unknown {
  if (!path) return message;
  const parts = path.split('.');
  if (parts.some((part) => UNSAFE_PATH_PARTS.has(part))) {
    onDiagnostic?.(
      createDiagnostic({
        level: 'warning',
        source: 'condition',
        message: `已拒绝不安全的消息路径: ${path}`,
      }),
    );
    return undefined;
  }

  let current = message;
  for (const part of parts) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** 读取受控 Operand；message 路径只访问对象自身字段，绝不沿原型链取值。 */
export function readOperand(
  operand: RuntimeOperand,
  context: RuntimeValueContext,
): unknown {
  switch (operand.source) {
    case 'literal':
      return operand.value;
    case 'variable':
      return context.variables[operand.key];
    case 'message':
      return readMessagePath(
        context.message,
        operand.path,
        context.onDiagnostic,
      );
    case 'node-visible':
      return context.isNodeVisible(operand.nodeId);
  }
}
