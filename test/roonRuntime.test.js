import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import fs from 'fs';
import fsPromises from 'fs/promises';
import RoonApi from 'node-roon-api';

vi.mock('electron', () => {
  throw new Error('The Roon service must not import Electron');
});
vi.mock('fs', () => ({ default: { readFileSync: vi.fn() } }));
vi.mock('fs/promises', () => ({
  default: { mkdir: vi.fn(), writeFile: vi.fn(), rename: vi.fn() },
}));
vi.mock('node-roon-api', () => ({
  default: vi.fn(function () {
    this.init_services = vi.fn();
    this.start_discovery = vi.fn();
  }),
}));
vi.mock('node-roon-api-browse', () => ({ default: vi.fn() }));
vi.mock('node-roon-api-transport', () => ({ default: vi.fn() }));
vi.mock('node-roon-api-image', () => ({ default: vi.fn() }));

const tokens = { 'core-id': 'existing-pairing-token' };
const ciphertext = Buffer.from('opaque OS-encrypted bytes');
const encrypted = {
  _encrypted: true,
  _version: 1,
  data: ciphertext.toString('base64'),
};
let runtime;
let options;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  runtime = {
    dataDirectory: '/custom/Application Support/Roon Random Album',
    appVersion: '1.8.5',
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn(() => ciphertext),
      decryptString: vi.fn(() => JSON.stringify(tokens)),
    },
  };
  const service = await import('../roonService.js');
  service.initialize(null, { get: vi.fn() }, runtime);
  options = RoonApi.mock.calls[0][0];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function persistedState(tokenValue) {
  return { tokens: tokenValue, paired_core_id: 'core-id' };
}

function loadState(tokenValue) {
  fs.readFileSync.mockReturnValue(
    JSON.stringify({ roonstate: persistedState(tokenValue), unrelated: true })
  );
  return options.get_persisted_state();
}

async function savedConfig() {
  await vi.runAllTimersAsync();
  expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
  return JSON.parse(fsPromises.writeFile.mock.calls[0][1]);
}

test('uses the supplied app version and unchanged extension identity', () => {
  expect(options.display_version).toBe(runtime.appVersion);
  expect(options.extension_id).toBe('com.markmcc.roonrandom');
});

test('reads and atomically writes config.json in the supplied data directory', async () => {
  options.get_persisted_state();
  expect(fs.readFileSync).toHaveBeenCalledWith(
    `${runtime.dataDirectory}/config.json`,
    'utf8'
  );
  options.set_persisted_state(persistedState(tokens));
  await savedConfig();
  expect(fsPromises.mkdir).toHaveBeenCalledWith(runtime.dataDirectory, {
    recursive: true,
  });
  expect(fsPromises.writeFile.mock.calls[0][0]).toBe(
    `${runtime.dataDirectory}/config.json.tmp`
  );
  expect(fsPromises.writeFile.mock.calls[0][2]).toBe('utf8');
  expect(fsPromises.rename).toHaveBeenCalledWith(
    `${runtime.dataDirectory}/config.json.tmp`,
    `${runtime.dataDirectory}/config.json`
  );
});

test('loads existing encrypted tokens and paired core without rewriting them', async () => {
  expect(loadState(encrypted)).toEqual(persistedState(tokens));
  expect(runtime.safeStorage.decryptString).toHaveBeenCalledWith(ciphertext);
  expect(runtime.safeStorage.decryptString.mock.contexts[0]).toBe(
    runtime.safeStorage
  );
  await vi.runAllTimersAsync();
  expect(fsPromises.writeFile).not.toHaveBeenCalled();
});

test('saves tokens using the unchanged encrypted envelope without mutating state', async () => {
  const state = persistedState(tokens);
  options.set_persisted_state(state);
  expect((await savedConfig()).roonstate).toEqual(persistedState(encrypted));
  expect(runtime.safeStorage.encryptString).toHaveBeenCalledWith(
    JSON.stringify(tokens)
  );
  expect(runtime.safeStorage.encryptString.mock.contexts[0]).toBe(
    runtime.safeStorage
  );
  expect(state.tokens).toEqual(tokens);
});

test('keeps plaintext tokens usable and migrates asynchronously as before', async () => {
  expect(loadState(tokens)).toEqual(persistedState(tokens));
  expect(fsPromises.writeFile).not.toHaveBeenCalled();
  expect(await savedConfig()).toEqual({
    roonstate: persistedState(encrypted),
    unrelated: true,
  });
});

test('retains plaintext persistence when encryption is unavailable', async () => {
  runtime.safeStorage.isEncryptionAvailable.mockReturnValue(false);
  expect(loadState(tokens)).toEqual(persistedState(tokens));
  expect((await savedConfig()).roonstate).toEqual(persistedState(tokens));
  expect(runtime.safeStorage.encryptString).not.toHaveBeenCalled();
});

test('retains plaintext fallback when encryption throws', async () => {
  runtime.safeStorage.encryptString.mockImplementation(() => {
    throw new Error('Keychain unavailable');
  });
  options.set_persisted_state(persistedState(tokens));
  expect((await savedConfig()).roonstate).toEqual(persistedState(tokens));
});

test.each(['unavailable', 'throws', 'invalid JSON'])(
  'retains empty-token fallback when decryption is %s',
  async failure => {
    if (failure === 'unavailable') {
      runtime.safeStorage.isEncryptionAvailable.mockReturnValue(false);
    } else if (failure === 'throws') {
      runtime.safeStorage.decryptString.mockImplementation(() => {
        throw new Error('Cannot decrypt');
      });
    } else {
      runtime.safeStorage.decryptString.mockReturnValue('invalid JSON');
    }
    expect(loadState(encrypted)).toEqual(persistedState({}));
    await vi.runAllTimersAsync();
    expect(fsPromises.writeFile).not.toHaveBeenCalled();
    if (failure === 'unavailable') {
      expect(runtime.safeStorage.decryptString).not.toHaveBeenCalled();
    }
  }
);

test('retains empty state when config is missing', () => {
  fs.readFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
  expect(options.get_persisted_state()).toEqual({});
  expect(runtime.safeStorage.decryptString).not.toHaveBeenCalled();
});
