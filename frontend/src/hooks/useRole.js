// frontend/src/hooks/useRole.js
import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';

const AI_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000';

/**
 * Generates a localStorage key scoped to a specific wallet address.
 */
function roleKey(walletAddress) {
  return `biotoken_role_${walletAddress.toLowerCase()}`;
}

export function useRole() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();

  const [role, setRole]                       = useState(null);       // 'manufacturer' | 'lab' | null
  const [pendingRole, setPendingRole]         = useState(null);
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const [roleLoading, setRoleLoading]         = useState(false);
  const [isRegistering, setIsRegistering]     = useState(false);
  const [registerError, setRegisterError]     = useState(null);

  // Reset role state when auth session ends so a fresh login/wallet can re-resolve role.
  useEffect(() => {
    if (authenticated) return;
    setRole(null);
    setPendingRole(null);
    setNeedsRoleSelection(false);
    setRoleLoading(false);
    setIsRegistering(false);
    setRegisterError(null);
  }, [authenticated]);

  // ── On auth + wallet ready: resolve role ────────────────────────
  useEffect(() => {
    if (!authenticated) return;

    const walletAddress = wallets?.[0]?.address;

    if (!walletAddress) {
      // Keep a short loading state while Privy is still resolving the active wallet.
      setRole(null);
      setPendingRole(null);
      setNeedsRoleSelection(false);
      setRoleLoading(true);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    // The API is authoritative because localStorage does not contain the
    // role-specific on-chain grant state.
    const fetchRole = async () => {
      setRoleLoading(true);
      setNeedsRoleSelection(false);
      setRegisterError(null);

      try {
        const res = await fetch(`${AI_URL}/api/user/${walletAddress}`, {
          signal: controller.signal,
        });

        if (cancelled) return;

        if (res.status === 404) {
          // User not registered — show role selection screen
          setNeedsRoleSelection(true);
          setRole(null);
          setPendingRole(null);
          return;
        }

        if (!res.ok) throw new Error(`Server error ${res.status}`);

        const data = await res.json();
        if (cancelled) return;

        if (data.role !== 'lab' && data.role !== 'manufacturer') {
          // Malformed/incomplete user record: fall back to role selection.
          setRole(null);
          setPendingRole(null);
          setNeedsRoleSelection(true);
          localStorage.removeItem(roleKey(walletAddress));
          return;
        }

        const resolved = data.role === 'lab' ? 'lab' : 'manufacturer';
        const granted = resolved === 'lab'
          ? data.labRoleGranted === true
          : data.manufacturerRoleGranted === true;

        if (!granted) {
          setRole(null);
          setPendingRole(resolved);
          setNeedsRoleSelection(false);
          localStorage.removeItem(roleKey(walletAddress));
          return;
        }

        setRole(resolved);
        setPendingRole(null);
        setNeedsRoleSelection(false);
        localStorage.setItem(roleKey(walletAddress), resolved);

        // Update lastLoginAt silently
        fetch(`${AI_URL}/api/user/${walletAddress}/login`, { method: 'PATCH' }).catch(() => {});
      } catch (err) {
        if (err?.name === 'AbortError' || cancelled) return;
        console.error('useRole: fetch error', err);
        // Network error — show role selection so user isn't stuck
        setNeedsRoleSelection(true);
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    };

    fetchRole();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authenticated, wallets?.[0]?.address]);

  // ── selectRole: called from RoleSelection page ──────────────────
  const selectRole = useCallback(async (selectedRole) => {
    const walletAddress = wallets?.[0]?.address;
    if (!walletAddress) throw new Error('No wallet connected');

    setIsRegistering(true);
    setRegisterError(null);

    try {
      const res = await fetch(`${AI_URL}/register-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          role: selectedRole,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Registration failed (${res.status})`);
      }

      // Persist
      setRole(selectedRole);
      setPendingRole(null);
      setNeedsRoleSelection(false);
      localStorage.setItem(roleKey(walletAddress), selectedRole);
    } catch (err) {
      setRegisterError(err.message);
      throw err;  // re-throw so RoleSelection page can catch
    } finally {
      setIsRegistering(false);
    }
  }, [wallets]);

  const retryRoleGrant = useCallback(async () => {
    const walletAddress = wallets?.[0]?.address;
    if (!walletAddress) throw new Error('No wallet connected');

    setIsRegistering(true);
    setRegisterError(null);
    try {
      const res = await fetch(`${AI_URL}/api/retry-role-grant/${walletAddress}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Role grant retry failed (${res.status})`);
      }

      const data = await res.json();
      setRole(data.role);
      setPendingRole(null);
      setNeedsRoleSelection(false);
      localStorage.setItem(roleKey(walletAddress), data.role);
    } catch (err) {
      setRegisterError(err.message);
      throw err;
    } finally {
      setIsRegistering(false);
    }
  }, [wallets]);

  return {
    role,
    pendingRole,
    rolePendingOnChain: pendingRole !== null,
    needsRoleSelection,
    isRegistering,
    registerError,
    roleLoading,
    selectRole,
    retryRoleGrant,
  };
}
