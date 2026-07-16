import type { ConditionGroup } from '@digital-twin/scene-schema';
import { describe, expect, it, vi } from 'vitest';
import { evaluateConditionGroup, readOperand } from '../src/index.js';

describe('运行时条件执行器', () => {
  it('读取变量、消息字段和节点显隐并计算嵌套 AND/OR', () => {
    const conditions: ConditionGroup = {
      logic: 'all',
      conditions: [
        {
          left: { source: 'variable', key: 'temperature' },
          operator: 'gte',
          right: { source: 'literal', value: 30 },
        },
        {
          logic: 'any',
          conditions: [
            {
              left: { source: 'message', path: 'device.online' },
              operator: 'eq',
              right: { source: 'literal', value: true },
            },
            {
              left: { source: 'node-visible', nodeId: 'fallback' },
              operator: 'truthy',
            },
          ],
        },
      ],
    };

    expect(
      evaluateConditionGroup(conditions, {
        variables: { temperature: 36 },
        message: { device: { online: true } },
        isNodeVisible: () => false,
      }),
    ).toBe(true);
  });

  it('拒绝原型链路径且不执行隐式数字转换', () => {
    const onDiagnostic = vi.fn();
    const context = {
      variables: {},
      message: { value: '36' },
      isNodeVisible: () => false,
      onDiagnostic,
    };

    expect(
      readOperand(
        { source: 'message', path: 'constructor.prototype.polluted' },
        context,
      ),
    ).toBeUndefined();
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning', source: 'condition' }),
    );
    expect(
      evaluateConditionGroup(
        {
          logic: 'all',
          conditions: [
            {
              left: { source: 'message', path: 'value' },
              operator: 'eq',
              right: { source: 'literal', value: 36 },
            },
          ],
        },
        context,
      ),
    ).toBe(false);
  });
});
