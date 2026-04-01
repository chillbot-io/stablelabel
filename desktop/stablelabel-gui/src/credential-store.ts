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
import { logger } from './logger';

function getCachePath(): string {
  return path.join(app.getPath('userData'), '.token-cache');
}

function getPrefsPath(): string {
  return path.join(app.getPath('userData'), '.preferences');
}

export const CredentialStore = {
  /** Load and decrypt the token cache. Returns null if not available. */
  load(): string | null {
    try {
      const cachePath = getCachePath();
      if (!existsSync(cachePath)) return null;
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn('CREDENTIAL_STORE', 'Encryption unavailable — refusing to load unencrypted token cache');
        return null;
      }
      const encrypted = readFileSync(cachePath);
      return safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  },

  /** Encrypt and save the token cache to disk. */
  save(plaintext: string): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        logger.error('CREDENTIAL_STORE', 'Encryption unavailable — refusing to store tokens unencrypted');
        return false;
      }
      const encrypted = safeStorage.encryptString(plaintext);
      writeFileSync(getCachePath(), encrypted, { mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  },

  /** Delete the token cache and preferences from disk (sign-out). */
  clear(): void {
    for (const p of [getCachePath(), getPrefsPath()]) {
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        // Best-effort
      }
    }
  },

  /** Whether encryption is available on this platform. */
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  },

  /** Load encrypted preferences (connection info, settings). */
  loadPrefs(): Record<string, unknown> {
    try {
      const prefsPath = getPrefsPath();
      if (!existsSync(prefsPath)) return {};
      if (!safeStorage.isEncryptionAvailable()) return {};
      const encrypted = readFileSync(prefsPath);
      return JSON.parse(safeStorage.decryptString(encrypted));
    } catch {
      return {};
    }
  },

  /** Encrypt and save preferences to disk. */
  savePrefs(prefs: Record<string, unknown>): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn('CREDENTIAL_STORE', 'Encryption unavailable — preferences will not be persisted');
        return false;
      }
      const encrypted = safeStorage.encryptString(JSON.stringify(prefs));
      writeFileSync(getPrefsPath(), encrypted, { mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  },
};
