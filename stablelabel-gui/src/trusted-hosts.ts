/**
 * Hosts trusted for external navigation (links opened in browser).
 * Superset of device-code hosts.
 */
export const TRUSTED_EXTERNAL_HOSTS = [
  'microsoft.com',
  'login.microsoftonline.com',
  'learn.microsoft.com',
  'aka.ms',
] as const;

/**
 * Hosts allowed to appear in device-code authentication URLs.
 * Subset of TRUSTED_EXTERNAL_HOSTS.
 */
export const ALLOWED_DEVICE_CODE_HOSTS = [
  'microsoft.com',
  'login.microsoftonline.com',
] as const;
