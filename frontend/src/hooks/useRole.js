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
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const [role, setRole]                       = useState(null);       // 'manufacturer' | 'lab' | null
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const [roleLoading, setRoleLoading]         = useState(false);
  const [isRegistering, setIsRegistering]     = useState(false);
  const [registerError, setRegisterError]     = useState(null);

  // ── On auth + wallet ready: resolve role ────────────────────────
  useEffect(() => {
    if (!authenticated || !wallets?.[0]) return;

    const walletAddress = wallets[0].address;

    // 1. Check localStorage first (instant)
    const cached = localStorage.getItem(roleKey(walletAddress));
    if (cached === 'manufacturer' || cached === 'lab') {
      setRole(cached);
      setNeedsRoleSelection(false);
      return;
    }

    // 2. Ask the API
    const fetchRole = async () => {
      setRoleLoading(true);
      setNeedsRoleSelection(false);
      setRegisterError(null);

      try {
        const res = await fetch(`${AI_URL}/api/user/${walletAddress}`);

        if (res.status === 404) {
          // User not registered — show role selection screen
          setNeedsRoleSelection(true);
          setRoleLoading(false);
          return;
        }

        if (!res.ok) throw new Error(`Server error ${res.status}`);

        const data = await res.json();
        const resolved = data.role === 'lab' ? 'lab' : 'manufacturer';
        setRole(resolved);
        setNeedsRoleSelection(false);

        // Cache for next visit
        localStorage.setItem(roleKey(walletAddress), resolved);

        // Update lastLoginAt silently
        fetch(`${AI_URL}/api/user/${walletAddress}/login`, { method: 'PATCH' }).catch(() => {});
      } catch (err) {
        console.error('useRole: fetch error', err);
        // Network error — show role selection so user isn't stuck
        setNeedsRoleSelection(true);
      } finally {
        setRoleLoading(false);
      }
    };

    fetchRole();
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
      setNeedsRoleSelection(false);
      localStorage.setItem(roleKey(walletAddress), selectedRole);
    } catch (err) {
      setRegisterError(err.message);
      throw err;  // re-throw so RoleSelection page can catch
    } finally {
      setIsRegistering(false);
    }
  }, [wallets]);

  return {
    role,
    needsRoleSelection,
    isRegistering,
    registerError,
    roleLoading,
    selectRole,
  };
}
