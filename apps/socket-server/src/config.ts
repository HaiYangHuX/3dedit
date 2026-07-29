import { z } from 'zod';

const integerString = z.string().regex(/^\d+$/).transform(Number);

const finiteNumberString = z
  .string()
  .trim()
  .min(1)
  .transform(Number)
  .refine(Number.isFinite, { message: '必须是有限数字' });

const environmentSchema = z.object({
  SOCKET_HOST: z.string().trim().min(1).default('127.0.0.1'),
  SOCKET_PORT: integerString
    .pipe(z.number().int().min(1).max(65_535))
    .default(18_080),
  SOCKET_DEMO_INTERVAL_MS: integerString
    .pipe(z.number().int().positive())
    .default(1_000),
  SOCKET_DEMO_RADIUS: finiteNumberString
    .pipe(z.number().nonnegative())
    .default(5),
});

export interface SocketServerConfig {
  host: string;
  port: number;
  demoIntervalMs: number;
  demoRadius: number;
}

export function loadSocketServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): SocketServerConfig {
  const parsed = environmentSchema.parse(env);
  return {
    host: parsed.SOCKET_HOST,
    port: parsed.SOCKET_PORT,
    demoIntervalMs: parsed.SOCKET_DEMO_INTERVAL_MS,
    demoRadius: parsed.SOCKET_DEMO_RADIUS,
  };
}
