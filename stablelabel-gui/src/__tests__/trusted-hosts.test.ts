import { describe, it, expect } from 'vitest';
import { TRUSTED_EXTERNAL_HOSTS, ALLOWED_DEVICE_CODE_HOSTS } from '../trusted-hosts';

describe('trusted-hosts', () => {
  describe('TRUSTED_EXTERNAL_HOSTS', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(TRUSTED_EXTERNAL_HOSTS)).toBe(true);
      expect(TRUSTED_EXTERNAL_HOSTS.length).toBeGreaterThan(0);
    });

    it('includes microsoft.com', () => {
      expect(TRUSTED_EXTERNAL_HOSTS).toContain('microsoft.com');
    });

    it('includes login.microsoftonline.com', () => {
      expect(TRUSTED_EXTERNAL_HOSTS).toContain('login.microsoftonline.com');
    });

    it('includes learn.microsoft.com', () => {
      expect(TRUSTED_EXTERNAL_HOSTS).toContain('learn.microsoft.com');
    });

    it('includes aka.ms', () => {
      expect(TRUSTED_EXTERNAL_HOSTS).toContain('aka.ms');
    });

    it('does not include any non-Microsoft domains', () => {
      for (const host of TRUSTED_EXTERNAL_HOSTS) {
        expect(host).toMatch(/microsoft|aka\.ms/);
      }
    });
  });

  describe('ALLOWED_DEVICE_CODE_HOSTS', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(ALLOWED_DEVICE_CODE_HOSTS)).toBe(true);
      expect(ALLOWED_DEVICE_CODE_HOSTS.length).toBeGreaterThan(0);
    });

    it('includes microsoft.com', () => {
      expect(ALLOWED_DEVICE_CODE_HOSTS).toContain('microsoft.com');
    });

    it('includes login.microsoftonline.com', () => {
      expect(ALLOWED_DEVICE_CODE_HOSTS).toContain('login.microsoftonline.com');
    });

    it('is a subset of TRUSTED_EXTERNAL_HOSTS', () => {
      for (const host of ALLOWED_DEVICE_CODE_HOSTS) {
        expect(TRUSTED_EXTERNAL_HOSTS).toContain(host);
      }
    });
  });
});
