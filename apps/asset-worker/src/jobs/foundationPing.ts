export interface FoundationPingResult {
  ok: true;
  workerId: string;
}

/** Worker 心跳任务用于验证 Redis、队列注册和进程生命周期。 */
export async function processFoundationPing(
  workerId: string,
): Promise<FoundationPingResult> {
  return { ok: true, workerId };
}
