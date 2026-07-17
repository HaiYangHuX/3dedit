import { describe, expect, it, vi } from 'vitest';
import {
  readScenePaletteDrag,
  SCENE_PALETTE_MIME,
  writeScenePaletteDrag,
  type ScenePaletteDragPayload,
} from '../src/editor/scenePaletteDrag';

function createDataTransfer() {
  const values = new Map<string, string>();
  return {
    values,
    transfer: {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn((type: string, value: string) => values.set(type, value)),
      getData: vi.fn((type: string) => values.get(type) ?? ''),
    } as unknown as DataTransfer,
  };
}

describe('scenePaletteDrag', () => {
  it.each<ScenePaletteDragPayload>([
    { kind: 'asset', assetId: 'asset-1', name: '水泵', format: 'glb' },
    { kind: 'geometry', primitive: 'box' },
    { kind: 'light', lightType: 'point' },
  ])('使用统一 MIME 往返 $kind payload', (payload) => {
    const { transfer } = createDataTransfer();

    writeScenePaletteDrag(transfer, payload);

    expect(transfer.effectAllowed).toBe('copy');
    expect(transfer.setData).toHaveBeenCalledWith(
      SCENE_PALETTE_MIME,
      JSON.stringify(payload),
    );
    expect(readScenePaletteDrag(transfer)).toEqual(payload);
  });

  it.each([
    '',
    '{broken',
    JSON.stringify({ assetId: 'legacy-asset', name: '旧协议', format: 'glb' }),
    JSON.stringify({
      kind: 'asset',
      assetId: 'asset-1',
      name: '模型',
      format: 'png',
    }),
    JSON.stringify({ kind: 'geometry', primitive: 'torus' }),
    JSON.stringify({ kind: 'light', lightType: 'rect-area' }),
    JSON.stringify({ kind: 'unknown' }),
  ])('拒绝非法或未知拖放数据 %#', (raw) => {
    const { transfer, values } = createDataTransfer();
    values.set(SCENE_PALETTE_MIME, raw);

    expect(readScenePaletteDrag(transfer)).toBeUndefined();
  });
});
