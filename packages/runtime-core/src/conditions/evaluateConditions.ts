import type {
  AtomicCondition,
  ConditionDefinition,
  ConditionGroup,
} from '@digital-twin/scene-schema';
import {
  readOperand,
  type RuntimeValueContext,
} from '../values/readOperand.js';

function compareAtomic(
  condition: AtomicCondition,
  context: RuntimeValueContext,
): boolean {
  const left = readOperand(condition.left, context);
  const right = condition.right
    ? readOperand(condition.right, context)
    : undefined;

  switch (condition.operator) {
    case 'eq':
      return Object.is(left, right);
    case 'ne':
      return !Object.is(left, right);
    case 'gt':
      return typeof left === 'number' && typeof right === 'number'
        ? left > right
        : false;
    case 'gte':
      return typeof left === 'number' && typeof right === 'number'
        ? left >= right
        : false;
    case 'lt':
      return typeof left === 'number' && typeof right === 'number'
        ? left < right
        : false;
    case 'lte':
      return typeof left === 'number' && typeof right === 'number'
        ? left <= right
        : false;
    case 'contains':
      if (typeof left === 'string' && typeof right === 'string') {
        return left.includes(right);
      }
      return Array.isArray(left)
        ? left.some((value) => Object.is(value, right))
        : false;
    case 'truthy':
      return Boolean(left);
    case 'falsy':
      return !left;
  }
}

function evaluateDefinition(
  definition: ConditionDefinition,
  context: RuntimeValueContext,
): boolean {
  return 'logic' in definition
    ? evaluateConditionGroup(definition, context)
    : compareAtomic(definition, context);
}

/** 空 AND 条件表示无附加限制；空 OR 条件没有任一分支，因此返回 false。 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  context: RuntimeValueContext,
): boolean {
  return group.logic === 'all'
    ? group.conditions.every((condition) =>
        evaluateDefinition(condition, context),
      )
    : group.conditions.some((condition) =>
        evaluateDefinition(condition, context),
      );
}
