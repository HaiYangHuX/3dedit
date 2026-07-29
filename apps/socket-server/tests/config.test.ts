import { describe, expect, it } from 'vitest';
import { loadSocketServerConfig } from '../src/config.js';

describe('loadSocketServerConfig', () => {
  it('uses local simulator defaults when variables are absent', () => {
    expect(loadSocketServerConfig({})).toEqual({
      host: '127.0.0.1',
      port: 18080,
      demoIntervalMs: 1000,
      demoRadius: 5,
    });
  });

  it('parses explicit values', () => {
    expect(
      loadSocketServerConfig({
        SOCKET_HOST: '0.0.0.0',
        SOCKET_PORT: '19090',
        SOCKET_DEMO_INTERVAL_MS: '250',
        SOCKET_DEMO_RADIUS: '2.5',
      }),
    ).toEqual({
      host: '0.0.0.0',
      port: 19090,
      demoIntervalMs: 250,
      demoRadius: 2.5,
    });
  });

  it.each([
    ['SOCKET_HOST', ''],
    ['SOCKET_PORT', '0'],
    ['SOCKET_PORT', '65536'],
    ['SOCKET_PORT', '1.5'],
    ['SOCKET_DEMO_INTERVAL_MS', '0'],
    ['SOCKET_DEMO_INTERVAL_MS', '1.5'],
    ['SOCKET_DEMO_RADIUS', '-1'],
    ['SOCKET_DEMO_RADIUS', 'NaN'],
  ])('rejects invalid %s=%s', (key, value) => {
    expect(() => loadSocketServerConfig({ [key]: value })).toThrow();
  });
});
