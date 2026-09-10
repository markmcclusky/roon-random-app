import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { roonClient } from '../renderer/roonClient.js';

// Load the real preload with mocked Electron to check the bridge contract.
function loadBridge(ipcRenderer = {}) {
  let bridge;
  runInNewContext(
    readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8'),
    {
      require: () => ({
        contextBridge: {
          exposeInMainWorld: (_name, api) => {
            bridge = api;
          },
        },
        ipcRenderer,
      }),
    }
  );
  return bridge;
}

const methods = Object.keys(loadBridge()).filter(name => name !== 'onEvent');

afterEach(() => vi.unstubAllGlobals());

describe('roonClient Electron adapter', () => {
  test('exposes the complete preload API', () => {
    expect(Object.keys(roonClient).sort()).toEqual(
      Object.keys(loadBridge()).sort()
    );
  });

  test.each(methods)(
    '%s preserves arguments and the returned promise',
    name => {
      const result = Promise.resolve({ ok: true });
      const method = vi.fn().mockReturnValue(result);
      const bridge = { [name]: method };
      vi.stubGlobal('window', { roon: bridge });

      for (const args of [[], ['value'], ['value', { option: true }]]) {
        expect(roonClient[name](...args)).toBe(result);
        expect(method).toHaveBeenLastCalledWith(...args);
        expect(method.mock.contexts.at(-1)).toBe(bridge);
      }
    }
  );

  test('propagates rejected promises and synchronous errors unchanged', async () => {
    const error = new Error('Connection failed');
    vi.stubGlobal('window', {
      roon: { testConnection: vi.fn().mockRejectedValue(error) },
    });
    await expect(roonClient.testConnection('host', 9330)).rejects.toBe(error);

    window.roon.testConnection.mockImplementation(() => {
      throw error;
    });
    expect(() => roonClient.testConnection('host', 9330)).toThrow(error);
  });

  test('preserves event payloads and independent subscription cleanup', () => {
    const listeners = new Set();
    const ipcRenderer = {
      on: vi.fn((_channel, handler) => listeners.add(handler)),
      removeListener: vi.fn((_channel, handler) => listeners.delete(handler)),
    };
    vi.stubGlobal('window', { roon: loadBridge(ipcRenderer) });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = roonClient.onEvent(first);
    const unsubscribeSecond = roonClient.onEvent(second);
    const payload = { type: 'nowPlaying', meta: { song: 'Track' } };
    listeners.forEach(handler => handler({}, payload));
    expect(first).toHaveBeenCalledWith(payload);
    expect(first.mock.calls[0][0]).toBe(payload);
    expect(second).toHaveBeenCalledWith(payload);

    unsubscribe();
    listeners.forEach(handler => handler({}, payload));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    unsubscribeSecond();
    expect(listeners.size).toBe(0);
    expect(() => roonClient.onEvent(null)()).not.toThrow();
  });

  test('returns the original synchronous unsubscribe function', () => {
    const unsubscribe = vi.fn();
    const callback = vi.fn();
    const onEvent = vi.fn().mockReturnValue(unsubscribe);
    vi.stubGlobal('window', { roon: { onEvent } });
    expect(roonClient.onEvent(callback)).toBe(unsubscribe);
    expect(onEvent).toHaveBeenCalledWith(callback);
  });
});
