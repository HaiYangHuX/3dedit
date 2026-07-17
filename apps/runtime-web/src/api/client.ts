interface ApiErrorBody {
  code?: string;
  message?: string | string[];
  [key: string]: unknown;
}

export class RuntimeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RuntimeApiError';
  }
}

export const apiBaseUrl =
  // 与编辑器使用同一平台专用端口，避免误请求到本机其他服务导致大量 404。
  (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3100/api').replace(
    /\/$/,
    '',
  );

/** 运行时只需要 GET JSON；保持客户端足够小，避免带入编辑器请求封装。 */
export async function runtimeApiRequest(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new RuntimeApiError(0, 'NETWORK_ERROR', '无法连接平台服务', error);
  }
  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // 非 JSON 错误页仍统一转换为可展示的运行时错误。
    }
    const message = Array.isArray(body.message)
      ? body.message.join('；')
      : (body.message ?? `请求失败（${response.status}）`);
    throw new RuntimeApiError(
      response.status,
      body.code ?? 'HTTP_ERROR',
      message,
      body,
    );
  }
  return response.json() as Promise<unknown>;
}
