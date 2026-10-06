import { describe, expect, it } from 'vitest';
import { isAbsolute } from 'node:path';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('listens on every interface on port 5580 by default, with an absolute data dir', () => {
    const config = loadConfig({});
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(5580);
    expect(isAbsolute(config.dataDir)).toBe(true);
    expect(config.dataDir.endsWith('obs-producer/data')).toBe(true);
    expect(isAbsolute(config.webDir)).toBe(true);
    expect(config.webDir.endsWith('obs-producer/apps/web/dist')).toBe(true);
    expect(config.apiDocs).toBe(false);
  });

  it('reads OBS_PRODUCER_* overrides', () => {
    const config = loadConfig({
      OBS_PRODUCER_HOST: '127.0.0.1',
      OBS_PRODUCER_PORT: '6000',
      OBS_PRODUCER_DATA_DIR: '/tmp/op-data',
      OBS_PRODUCER_WEB_DIR: '/tmp/op-web',
      OBS_PRODUCER_API_DOCS: '1',
    });
    expect(config).toEqual({
      host: '127.0.0.1',
      port: 6000,
      dataDir: '/tmp/op-data',
      webDir: '/tmp/op-web',
      apiDocs: true,
    });
  });

  it('ignores the unprefixed HOST and PORT that shells like zsh set', () => {
    expect(loadConfig({ HOST: 'my-laptop.local', PORT: '1' })).toMatchObject({ host: '0.0.0.0', port: 5580 });
  });

  it('rejects a port that is not a whole number from 1 to 65535', () => {
    for (const bad of ['0', '65536', 'abc', '80.5', '']) {
      expect(() => loadConfig({ OBS_PRODUCER_PORT: bad }), bad).toThrow(/OBS_PRODUCER_PORT/);
    }
  });

  it('turns the API explorer on with 1 or true, and off with 0, false or nothing', () => {
    for (const on of ['1', 'true', 'TRUE']) expect(loadConfig({ OBS_PRODUCER_API_DOCS: on }).apiDocs, on).toBe(true);
    for (const off of ['0', 'false', '']) expect(loadConfig({ OBS_PRODUCER_API_DOCS: off }).apiDocs, off).toBe(false);
  });

  it('rejects any other value for OBS_PRODUCER_API_DOCS', () => {
    for (const bad of ['yes', 'on', '2']) {
      expect(() => loadConfig({ OBS_PRODUCER_API_DOCS: bad }), bad).toThrow(/OBS_PRODUCER_API_DOCS/);
    }
  });
});
