import { createDefaultSceneDocument } from '@digital-twin/scene-schema';
import { describe, expect, it } from 'vitest';
import {
  createProjectInputSchema,
  createSceneInputSchema,
  reorderScenesInputSchema,
  saveSceneInputSchema,
  updateProjectInputSchema,
} from '../src/index.js';

describe('项目与场景 API 契约', () => {
  it('清理名称并拒绝空项目名', () => {
    expect(createProjectInputSchema.parse({ name: '  化工厂  ' })).toEqual({
      name: '化工厂',
      description: '',
    });
    expect(() => createProjectInputSchema.parse({ name: '   ' })).toThrow();
    expect(() => updateProjectInputSchema.parse({})).toThrow();
  });

  it('验证场景名称与不重复的排序 ID', () => {
    expect(createSceneInputSchema.parse({ name: '  厂区  ' })).toEqual({
      name: '厂区',
    });
    expect(() =>
      reorderScenesInputSchema.parse({ sceneIds: ['scene-1', 'scene-1'] }),
    ).toThrow();
  });

  it('使用真实场景协议验证保存请求', () => {
    const document = createDefaultSceneDocument(
      'project-1',
      'scene-1',
      '场景一',
    );

    expect(saveSceneInputSchema.parse({ baseRevision: 0, document })).toEqual({
      baseRevision: 0,
      document,
    });
    expect(() =>
      saveSceneInputSchema.parse({ baseRevision: -1, document }),
    ).toThrow();
  });
});
