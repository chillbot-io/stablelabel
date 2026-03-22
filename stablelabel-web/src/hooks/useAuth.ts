/**
 * Auth hook — wraps MSAL React to provide user info and token acquisition.
 */

import { useMsal } from '@azure/msal-react';
import { useCallback, useMemo } from 'react';
import { loginRequest } from '@/lib/msal-config';
import type { CurrentUser } from '@/lib/types';

export function useAuth() {
  const { instance, accounts } = useMsal();
  const account = accounts[0] ?? null;

  const login = useCallback(async () => {
    await instance.loginRedirect(loginRequest);
  }, [instance]);

  const logout = useCallback(async () => {
    await instance.logoutRedirect();
  }, [instance]);

  /** Get the ID token silently (from cache or refresh). */
  const getToken = useCallback(async (): Promise<string | null> => {
    if (!account) return null;
    try {
      const result = await instance.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      return result.idToken;
    } catch {
      // Silent acquisition failed — trigger interactive login
      await instance.acquireTokenRedirect(loginRequest);
      return null;
    }
  }, [instance, account]);

  /** Current user derived from the MSAL account + ID token claims. */
  const user: CurrentUser | null = useMemo(() => {
    if (!account) return null;
    const claims = account.idTokenClaims as Record<string, unknown> | undefined;
    const roles = (claims?.roles as string[]) ?? [];
    return {
      id: (claims?.oid as string) ?? account.localAccountId,
      email: account.username,
      displayName: account.name ?? account.username,
      role: (['Admin', 'Operator', 'Viewer'].find((r) => roles.includes(r)) ??
        'Viewer') as CurrentUser['role'],
      mspTenantId: account.tenantId,
      entraTenantId: account.tenantId,
    };
  }, [account]);

  return {
    isAuthenticated: !!account,
    user,
    login,
    logout,
    getToken,
  };
}
