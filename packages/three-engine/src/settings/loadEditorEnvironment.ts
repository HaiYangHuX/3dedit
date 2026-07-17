import type {
  EnvironmentMapGenerator,
  EnvironmentMapTarget,
  EnvironmentTextureLoader,
} from './SceneSettingsSystem.js';

export interface LoadEditorEnvironmentOptions {
  loader: EnvironmentTextureLoader;
  generator: EnvironmentMapGenerator;
  isStale?(): boolean;
}

/**
 * 将编辑器默认 HDR 转成独立 PMREM target。
 * 组件可能在网络请求期间卸载，因此转换前必须再次检查 Renderer 所有权。
 */
export async function loadEditorEnvironment(
  url: string,
  options: LoadEditorEnvironmentOptions,
): Promise<EnvironmentMapTarget | undefined> {
  const sourceTexture = await options.loader.loadAsync(url);
  if (options.isStale?.()) {
    sourceTexture.dispose();
    return undefined;
  }

  try {
    return options.generator.fromEquirectangular(sourceTexture);
  } finally {
    // PMREM target 已拥有转换结果，原始经纬 HDR 不再被 Scene 引用。
    sourceTexture.dispose();
  }
}
