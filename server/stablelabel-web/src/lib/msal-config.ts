/**
 * MSAL configuration for the "StableLabel" auth app registration.
 *
 * Environment variables (set in .env):
 *   VITE_ENTRA_CLIENT_ID — App registration client ID
 *   VITE_ENTRA_AUTHORITY — https://login.microsoftonline.com/common (multi-tenant)
 *   VITE_ENTRA_REDIRECT_URI — http://localhost:5173 (dev)
 */

import { type Configuration, LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID || '',
    authority: import.meta.env.VITE_ENTRA_AUTHORITY || 'https://login.microsoftonline.com/common',
    redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI || 'http://localhost:5173',
    postLogoutRedirectUri: '/',
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, message) => {
        if (import.meta.env.DEV) {
          console.debug('[MSAL]', message);
        }
      },
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
    },
  },
};

/** Scopes requested during login — openid + profile + email only. */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};
