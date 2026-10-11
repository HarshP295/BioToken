// frontend/src/hooks/useRole.js
import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { getSmartAccountAddress, pickTxWallet } from '../lib/pimlico';
import { AI_API_URL, CONTRACT_ADDRESS } from '../config';

const AI_URL = AI_API_URL;

/** Must match registration_message() in ai/api.py. */
export function registrationMessage(role, wallet, holder, issuedAt) {
  return [
    'BioToken role registration',
    `Role: ${role}`,
    `Wallet: ${ethers.getAddress(wallet)}`,
    `Role holder: ${ethers.getAddress(holder)}`,
    `Issued at: ${issuedAt}`,
  ].join('\n');
}

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
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  // Reset role state when auth session ends so a fresh login/wallet can re-resolve role.
  useEffect(() => {
    if (authenticated) return;
    setRole(null);
    setPendingRole(null);
    setAwaitingApproval(false);
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
        // Gasless transactions come from the smart account, so the role only
        // counts if it was granted to that address, on the current contract.
        // Anything else (old EOA grants, grants on a previous deployment,
        // pending approval) shows the retry screen, which re-registers.
        const txWallet = pickTxWallet(wallets);
        const smartAccount = txWallet ? (await getSmartAccountAddress(txWallet)).toLowerCase() : null;
        if (cancelled) return;
        const granted = (resolved === 'lab'
          ? data.labRoleGranted === true
          : data.manufacturerRoleGranted === true)
          && (data.roleHolderAddress || '').toLowerCase() === smartAccount
          && (data.roleContract || '') === CONTRACT_ADDRESS.toLowerCase();

        if (!granted) {
          setRole(null);
          setPendingRole(resolved);
          setAwaitingApproval(data.roleApproved !== true);
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
      // The wallet signs the request; the API grants the role to the smart
      // account that sends this user's gasless transactions.
      const smartAccountAddress = await getSmartAccountAddress(pickTxWallet(wallets));
      const issuedAt = Math.floor(Date.now() / 1000);
      const message = registrationMessage(selectedRole, walletAddress, smartAccountAddress, issuedAt);
      const provider = await wallets[0].getEthereumProvider();
      const signature = await provider.request({
        method: 'personal_sign',
        params: [ethers.hexlify(ethers.toUtf8Bytes(message)), walletAddress],
      });

      const res = await fetch(`${AI_URL}/register-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          role: selectedRole,
          smart_account_address: smartAccountAddress,
          issued_at: issuedAt,
          signature,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Registration failed (${res.status})`);
      }
      const body = await res.json();

      if (body.pending) {
        // Waiting for an administrator; the retry screen explains this.
        setRole(null);
        setPendingRole(selectedRole);
        setAwaitingApproval(true);
        setNeedsRoleSelection(false);
        return;
      }

      // Persist
      setRole(selectedRole);
      setPendingRole(null);
      setAwaitingApproval(false);
      setNeedsRoleSelection(false);
      localStorage.setItem(roleKey(walletAddress), selectedRole);
    } catch (err) {
      setRegisterError(err.message);
      throw err;  // re-throw so RoleSelection page can catch
    } finally {
      setIsRegistering(false);
    }
  }, [wallets]);

  // Re-registering repairs every not-granted case (failed grant, old EOA
  // grant, previous deployment) and keeps an existing admin approval.
  const retryRoleGrant = useCallback(async () => {
    if (!pendingRole) return;
    await selectRole(pendingRole).catch(() => {});
  }, [pendingRole, selectRole]);

  return {
    role,
    pendingRole,
    rolePendingOnChain: pendingRole !== null,
    awaitingApproval,
    needsRoleSelection,
    isRegistering,
    registerError,
    roleLoading,
    selectRole,
    retryRoleGrant,
  };
}
