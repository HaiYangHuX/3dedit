import { z } from 'zod';

export const SOCKET_TASK_TYPES = [
  'ModelPosition',
  'ModelRotation',
  'ModelScale',
  'ModelVisible',
  'ModelColor',
  'TextUpdate',
  'ChartUpdate',
  'VideoControl',
  'AnimationControl',
  'CameraMove',
] as const;

export const socketTaskTypeSchema = z.enum(SOCKET_TASK_TYPES);

export type SocketTaskType = z.infer<typeof socketTaskTypeSchema>;
