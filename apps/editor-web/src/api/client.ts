interface ApiErrorBody {
  code?: string;
  message?: string | string[];
  [key: string]: unknown;
}

/** 保留 HTTP 状态和业务错误码，供页面区分冲突、校验和网络故障。 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api'
).replace(/\/$/, '');

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return {};
  }
}

export interface ApiRequestOptions extends Omit<
  RequestInit,
  'body' | 'headers'
> {
  body?: unknown;
  headers?: Record<string, string>;
}

/** 统一处理 JSON、204、Nest 错误体和网络异常，业务 API 只需声明路径与类型。 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers, ...requestOptions } = options;
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(0, 'NETWORK_ERROR', '无法连接平台服务', error);
  }

  if (!response.ok) {
    const error = await readErrorBody(response);
    const message = Array.isArray(error.message)
      ? error.message.join('；')
      : (error.message ?? `请求失败（${response.status}）`);
    throw new ApiError(
      response.status,
      error.code ?? 'HTTP_ERROR',
      message,
      error,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
