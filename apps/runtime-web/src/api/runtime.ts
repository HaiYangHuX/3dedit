import {
  assetDetailSchema,
  publicationManifestSchema,
  sceneDetailSchema,
  type AssetDetail,
  type PublicationManifest,
  type SceneDetail,
} from '@digital-twin/api-contracts';
import { runtimeApiRequest } from './client.js';

const idPath = (id: string) => encodeURIComponent(id);

/** preview 与 publication 使用不同读取端点，但所有网络结果都先通过共享 Zod 契约。 */
export const runtimeApi = {
  async getPreviewScene(sceneId: string): Promise<SceneDetail> {
    return sceneDetailSchema.parse(
      await runtimeApiRequest(`/scenes/${idPath(sceneId)}`),
    );
  },
  async getAsset(assetId: string): Promise<AssetDetail> {
    return assetDetailSchema.parse(
      await runtimeApiRequest(`/assets/${idPath(assetId)}`),
    );
  },
  async getPublicationManifest(
    publicationId: string,
  ): Promise<PublicationManifest> {
    return publicationManifestSchema.parse(
      await runtimeApiRequest(
        `/publications/${idPath(publicationId)}/manifest`,
      ),
    );
  },
};

export type { PublicationManifest } from '@digital-twin/api-contracts';
