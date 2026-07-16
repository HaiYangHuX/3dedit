import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRACO_DECODER_PATH,
  DEFAULT_KTX2_TRANSCODER_PATH,
} from '../src/index.js';

describe('Three decoder 静态路径', () => {
  it('使用 editor/runtime public 共享的绝对 decoder 路径', () => {
    expect(DEFAULT_DRACO_DECODER_PATH).toBe('/decoders/draco/');
    expect(DEFAULT_KTX2_TRANSCODER_PATH).toBe('/decoders/basis/');
  });
});
