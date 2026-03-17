/**
 * Credential Store — encrypts and persists MSAL token cache using Electron's safeStorage.
 *
 * safeStorage uses OS-level credential stores:
 *   - Windows: DPAPI
 *   - macOS: Keychain
 *   - Linux: libsecret / gnome-keyring
 *
 * The token cache file is stored in the app's userData directory.
 */

import { safeStorage, app } from 'electron';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';

function getCachePath(): string {
  return path.join(app.getPath('userData'), '.token-cache');
}

export const CredentialStore = {
  /** Load and decrypt the token cache. Returns null if not available. */
  load(): string | null {
    try {
      const cachePath = getCachePath();
      if (!existsSync(cachePath)) return null;
      if (!safeStorage.isEncryptionAvailable()) return null;
      const encrypted = readFileSync(cachePath);
      return safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  },

  /** Encrypt and save the token cache to disk. */
  save(plaintext: string): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      const encrypted = safeStorage.encryptString(plaintext);
      writeFileSync(getCachePath(), encrypted, { mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  },

  /** Delete the token cache from disk (sign-out). */
  clear(): void {
    try {
      const cachePath = getCachePath();
      if (existsSync(cachePath)) {
        unlinkSync(cachePath);
      }
    } catch {
      // Best-effort
    }
  },

  /** Whether encryption is available on this platform. */
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  },
};
