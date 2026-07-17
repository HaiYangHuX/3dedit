/**
 * 内置环境预设使用协议级 ID，不进入数据库素材库，也不依赖对象存储。
 * URL 和缩略图由 three-engine 提供，服务端只需要识别这些 ID 不应参与资源引用校验。
 */
export const BUILTIN_ENVIRONMENT_ASSET_IDS = [
  'builtin-environment-cathedral',
  'builtin-environment-bridge',
  'builtin-environment-glacier',
  'builtin-environment-mountain',
  'builtin-environment-snowfield',
  'builtin-environment-snow-town',
] as const;

export type BuiltinEnvironmentAssetId =
  (typeof BUILTIN_ENVIRONMENT_ASSET_IDS)[number];

export function isBuiltinEnvironmentAssetId(
  assetId: string,
): assetId is BuiltinEnvironmentAssetId {
  return (BUILTIN_ENVIRONMENT_ASSET_IDS as readonly string[]).includes(assetId);
}
