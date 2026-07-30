import { describe, expect, it } from 'vitest';
import {
  SHADER_METHODS,
  sceneDocumentSchema,
  shaderComponentSchema,
} from '../src/index.js';
import { createDefaultSceneDocument } from '../src/defaultDocument.js';

describe('shader scene schema', () => {
  it('接受原站源码声明的全部 13 个 Shader 方法', () => {
    expect(SHADER_METHODS).toHaveLength(13);
    for (const shaderMethod of SHADER_METHODS) {
      expect(
        shaderComponentSchema.parse({ kind: 'shader', shaderMethod }),
      ).toEqual({ kind: 'shader', shaderMethod });
    }
  });

  it('拒绝未知 Shader 方法和旧的泛型 data 占位协议', () => {
    expect(
      shaderComponentSchema.safeParse({
        kind: 'shader',
        shaderMethod: 'CreateUnknownShader',
      }).success,
    ).toBe(false);
    expect(
      shaderComponentSchema.safeParse({ kind: 'shader', data: {} }).success,
    ).toBe(false);
  });

  it('SceneDocument 可持久化并恢复强类型 Shader 组件', () => {
    const document = createDefaultSceneDocument('project-1', 'scene-1', '场景');
    document.nodes.shader = {
      id: 'shader',
      parentId: null,
      childIds: [],
      name: '扫描雷达',
      enabled: true,
      locked: false,
      transform: {
        position: [1, 0, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [{ kind: 'shader', shaderMethod: 'CreateRadarShader' }],
      businessData: {},
    };
    document.rootNodeIds = ['shader'];

    const parsed = sceneDocumentSchema.parse(document);

    expect(parsed.nodes.shader?.components).toEqual([
      { kind: 'shader', shaderMethod: 'CreateRadarShader' },
    ]);
  });
});
