import type {
  AssetDetail,
  AssetListResponse,
  AssetStatus,
  AssetKind,
  CompleteUploadInput,
  CreateUploadRequest,
  UpdateAssetInput,
  UploadCompletion,
  UploadSession,
} from '@digital-twin/api-contracts';
import { apiRequest } from './client';

const idPath = (id: string) => encodeURIComponent(id);

export interface AssetListParameters {
  page: number;
  pageSize: number;
  keyword?: string;
  kind?: AssetKind;
  category?: string;
  status?: AssetStatus;
  favorite?: boolean;
}

function listQuery(parameters: AssetListParameters): string {
  const query = new URLSearchParams({
    page: String(parameters.page),
    pageSize: String(parameters.pageSize),
  });
  for (const [key, value] of Object.entries(parameters)) {
    if (
      key === 'page' ||
      key === 'pageSize' ||
      value === undefined ||
      value === ''
    )
      continue;
    query.set(key, String(value));
  }
  return query.toString();
}

/** 模型库 REST API，上传源文件本身不会经过该 JSON 客户端。 */
export const assetApi = {
  list(parameters: AssetListParameters): Promise<AssetListResponse> {
    return apiRequest(`/assets?${listQuery(parameters)}`);
  },
  get(id: string): Promise<AssetDetail> {
    return apiRequest(`/assets/${idPath(id)}`);
  },
  update(id: string, input: UpdateAssetInput): Promise<AssetDetail> {
    return apiRequest(`/assets/${idPath(id)}`, {
      method: 'PATCH',
      body: input,
    });
  },
  remove(id: string): Promise<void> {
    return apiRequest(`/assets/${idPath(id)}`, { method: 'DELETE' });
  },
  retry(id: string): Promise<UploadCompletion> {
    return apiRequest(`/assets/${idPath(id)}/retry`, { method: 'POST' });
  },
  createUpload(input: CreateUploadRequest): Promise<UploadSession> {
    return apiRequest('/uploads', { method: 'POST', body: input });
  },
  completeUpload(
    id: string,
    input: CompleteUploadInput,
  ): Promise<UploadCompletion> {
    return apiRequest(`/uploads/${idPath(id)}/complete`, {
      method: 'POST',
      body: input,
    });
  },
  cancelUpload(id: string): Promise<void> {
    return apiRequest(`/uploads/${idPath(id)}`, { method: 'DELETE' });
  },
};
