// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
  app: {
    getPath: vi.fn().mockReturnValue('/fake/userData'),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:path', () => ({
  default: { join: (...parts: string[]) => parts.join('/') },
  join: (...parts: string[]) => parts.join('/'),
}));

import { CredentialStore } from '../credential-store';
import { safeStorage, app } from 'electron';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const mockSafeStorage = vi.mocked(safeStorage);
const mockApp = vi.mocked(app);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockUnlinkSync = vi.mocked(unlinkSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockApp.getPath.mockReturnValue('/fake/userData');
});

describe('CredentialStore', () => {
  describe('load()', () => {
    it('returns null when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(CredentialStore.load()).toBeNull();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('returns null when encryption is not available', () => {
      mockExistsSync.mockReturnValue(true);
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      expect(CredentialStore.load()).toBeNull();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('decrypts and returns cache content when file exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      const encryptedBuffer = Buffer.from('encrypted-data');
      mockReadFileSync.mockReturnValue(encryptedBuffer as any);
      mockSafeStorage.decryptString.mockReturnValue('decrypted-token-cache');

      const result = CredentialStore.load();

      expect(result).toBe('decrypted-token-cache');
      expect(mockReadFileSync).toHaveBeenCalledWith('/fake/userData/.token-cache');
      expect(mockSafeStorage.decryptString).toHaveBeenCalledWith(encryptedBuffer);
    });

    it('returns null on any error (corrupt file, etc.)', () => {
      mockExistsSync.mockReturnValue(true);
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('corrupt file');
      });

      expect(CredentialStore.load()).toBeNull();
    });
  });

  describe('save()', () => {
    it('returns false when encryption is not available', () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      expect(CredentialStore.save('some-data')).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('encrypts and writes to file with mode 0o600', () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      const encryptedBuffer = Buffer.from('encrypted');
      mockSafeStorage.encryptString.mockReturnValue(encryptedBuffer);

      CredentialStore.save('plaintext-cache');

      expect(mockSafeStorage.encryptString).toHaveBeenCalledWith('plaintext-cache');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/fake/userData/.token-cache',
        encryptedBuffer,
        { mode: 0o600 },
      );
    });

    it('returns true on success', () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockSafeStorage.encryptString.mockReturnValue(Buffer.from('enc'));

      expect(CredentialStore.save('data')).toBe(true);
    });

    it('returns false on write error', () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      mockSafeStorage.encryptString.mockReturnValue(Buffer.from('enc'));
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('disk full');
      });

      expect(CredentialStore.save('data')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('deletes the file when it exists', () => {
      mockExistsSync.mockReturnValue(true);

      CredentialStore.clear();

      expect(mockUnlinkSync).toHaveBeenCalledWith('/fake/userData/.token-cache');
    });

    it('does nothing when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      CredentialStore.clear();

      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('does not throw on delete error', () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('permission denied');
      });

      expect(() => CredentialStore.clear()).not.toThrow();
    });
  });

  describe('isAvailable()', () => {
    it('returns safeStorage.isEncryptionAvailable() result', () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
      expect(CredentialStore.isAvailable()).toBe(true);

      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
      expect(CredentialStore.isAvailable()).toBe(false);
    });
  });
});
