import {
  publicationDetailSchema,
  type PublicationDetail,
  type PublishSceneInput,
} from '@digital-twin/api-contracts';
import { apiRequest } from './client.js';

const idPath = (id: string) => encodeURIComponent(id);

export const publicationApi = {
  async publish(
    projectId: string,
    input: PublishSceneInput,
  ): Promise<PublicationDetail> {
    return publicationDetailSchema.parse(
      await apiRequest<unknown>(`/projects/${idPath(projectId)}/publication`, {
        method: 'POST',
        body: input,
      }),
    );
  },
  async getCurrent(projectId: string): Promise<PublicationDetail> {
    return publicationDetailSchema.parse(
      await apiRequest<unknown>(`/projects/${idPath(projectId)}/publication`),
    );
  },
};
