import { describe, expect, it, vi } from 'vitest';
import { SelectionModel } from '../src/index.js';

describe('SelectionModel', () => {
  it('支持替换、切换、多选主项和删除失效选择', () => {
    const selection = new SelectionModel();
    const listener = vi.fn();
    selection.subscribe(listener);

    selection.set(['node-1', 'node-2'], 'node-2');
    expect(selection.ids).toEqual(['node-1', 'node-2']);
    expect(selection.primaryId).toBe('node-2');

    selection.toggle('node-1');
    expect(selection.ids).toEqual(['node-2']);
    expect(selection.primaryId).toBe('node-2');

    selection.remove(['node-2']);
    expect(selection.ids).toEqual([]);
    expect(selection.primaryId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('相同集合不会重复通知且 getter 不泄漏内部集合', () => {
    const selection = new SelectionModel();
    const listener = vi.fn();
    selection.subscribe(listener);
    selection.set(['node-1']);
    selection.set(['node-1']);

    const ids = selection.ids;
    ids.push('external');
    expect(selection.ids).toEqual(['node-1']);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
