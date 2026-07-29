import {
  socketTaskTypeSchema,
  type SocketTaskType,
} from '@digital-twin/scene-schema/socket-task-types';
import { z } from 'zod';

const socketTaskMessageSchema = z.object({
  taskCode: z.string().min(1),
  taskType: socketTaskTypeSchema.optional(),
  taskTime: z.number().int().nonnegative().optional(),
  taskData: z.record(z.string(), z.json()).optional(),
});

const broadcastPayloadSchema = z.union([
  socketTaskMessageSchema,
  z.array(socketTaskMessageSchema).min(1),
]);

export interface SocketTaskMessage {
  taskCode: string;
  taskType?: SocketTaskType;
  taskTime?: number;
  taskData?: Record<string, unknown>;
}

export function parseBroadcastPayload(input: unknown): SocketTaskMessage[] {
  const parsed = broadcastPayloadSchema.parse(input);
  return Array.isArray(parsed) ? parsed : [parsed];
}
