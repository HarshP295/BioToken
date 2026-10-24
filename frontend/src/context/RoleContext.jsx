// frontend/src/context/RoleContext.jsx
// ─────────────────────────────────────────────────────────────────
// One shared place that works out the signed-in user's wallet and role.
// Every component reads it through useRole() (hooks/useRole.js), so the lookup (API call +
// smart account address) runs once per sign-in instead of once per page.
// ─────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { getSmartAccountAddress, pickTxWallet } from '../lib/pimlico';
import { AI_API_URL, CONTRACT_ADDRESS } from '../config';
import { registrationMessage } from '../lib/roleRegistration';
import { RoleContext } from './roleContextObject';

// A sleeping free Render instance takes up to about a minute to answer.
const LOOKUP_TIMEOUT_MS = 75_000;
// After this long the loading screen explains that the server may be waking up.
const SLOW_LOOKUP_MS = 6_000;
// How long to wait for Privy to hand over a wallet before offering help.
const WALLET_WAIT_MS = 20_000;

const ROLES = ['manufacturer', 'lab'];

/**
 * status:
 *   signed-out      not authenticated
 *   waiting-wallet  signed in, Privy has not handed over a wallet yet
 *   no-wallet       still no wallet after WALLET_WAIT_MS
 *   checking        asking the API for this wallet's role
 *   needs-role      wallet is not registered yet
 *   pending         registered, but the role is not active on-chain yet
 *   ready           role is active
 *   error           the role lookup failed (server down, timeout, …)
 */

function roleKey(walletAddress) {
  return `biotoken_role_${walletAddress.toLowerCase()}`;
}

function readCachedRole(walletAddress) {
  try {
    const role = localStorage.getItem(roleKey(walletAddress));
    return ROLES.includes(role) ? role : null;
  } catch {
    return null;
  }
}

function writeCachedRole(walletAddress, role) {
  try {
    if (role) localStorage.setItem(roleKey(walletAddress), role);
    else localStorage.removeItem(roleKey(walletAddress));
  } catch { /* storage unavailable */ }
}

async function errorDetail(res) {
  const body = await res.json().catch(() => ({}));
  return typeof body.detail === 'string' ? body.detail : `Server error ${res.status}`;
}

export function RoleProvider({ children }) {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();

  // The wallet whose smart account sends gasless transactions. It is also the
  // identity the role is registered under, so both always match.
  const txWallet = pickTxWallet(wallets);
  const walletAddress = txWallet?.address;

  const [status, setStatus]                 = useState('signed-out');
  const [role, setRole]                     = useState(null);
  const [pendingRole, setPendingRole]       = useState(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [isRegistering, setIsRegistering]   = useState(false);
  const [registerError, setRegisterError]   = useState(null);
  const [loadError, setLoadError]           = useState(null);
  const [slow, setSlow]                     = useState(false);
  const [choosingRole, setChoosingRole]     = useState(false);
  const [reloadKey, setReloadKey]           = useState(0);

  // ── Signed out: forget everything ────────────────────────────────
  useEffect(() => {
    if (authenticated) return;
    setStatus('signed-out');
    setRole(null);
    setPendingRole(null);
    setAwaitingApproval(false);
    setIsRegistering(false);
    setRegisterError(null);
    setLoadError(null);
    setSlow(false);
    setChoosingRole(false);
  }, [authenticated]);

  // ── Signed in, but no wallet yet ─────────────────────────────────
  useEffect(() => {
    if (!authenticated || walletAddress) return;
    setStatus('waiting-wallet');
    setRole(null);
    setPendingRole(null);
    const timer = setTimeout(() => setStatus('no-wallet'), WALLET_WAIT_MS);
    return () => clearTimeout(timer);
  }, [authenticated, walletAddress, reloadKey]);

  // ── Wallet ready: look up the role ───────────────────────────────
  useEffect(() => {
    if (!authenticated || !walletAddress) return;

    // A role this browser saw granted before is shown at once and checked in
    // the background, so returning users do not wait on the server.
    const cachedRole = readCachedRole(walletAddress);
    setRole(cachedRole);
    setStatus(cachedRole ? 'ready' : 'checking');
    setPendingRole(null);
    setAwaitingApproval(false);
    setLoadError(null);
    setRegisterError(null);
    setSlow(false);

    let cancelled = false;
    let timedOut = false;
    const controller = new AbortController();
    const slowTimer = setTimeout(() => setSlow(true), SLOW_LOOKUP_MS);
    const timeoutTimer = setTimeout(() => { timedOut = true; controller.abort(); }, LOOKUP_TIMEOUT_MS);

    // Start the smart-account lookup alongside the API call.
    const smartAccountPromise = getSmartAccountAddress(txWallet);
    smartAccountPromise.catch(() => {});

    const lookUpRole = async () => {
      try {
        const res = await fetch(`${AI_API_URL}/api/user/${walletAddress}`, { signal: controller.signal });
        if (cancelled) return;

        if (res.status === 404) {
          writeCachedRole(walletAddress, null);
          setRole(null);
          setStatus('needs-role');
          return;
        }
        if (!res.ok) throw new Error(await errorDetail(res));

        const data = await res.json();
        if (cancelled) return;

        if (!ROLES.includes(data.role)) {
          // Incomplete record: let the user pick again.
          writeCachedRole(walletAddress, null);
          setRole(null);
          setStatus('needs-role');
          return;
        }

        // Gasless transactions come from the smart account, so the role only
        // counts if it was granted to that address, on the current contract.
        const smartAccount = (await smartAccountPromise).toLowerCase();
        if (cancelled) return;
        const granted = (data.role === 'lab'
          ? data.labRoleGranted === true
          : data.manufacturerRoleGranted === true)
          && (data.roleHolderAddress || '').toLowerCase() === smartAccount
          && (data.roleContract || '') === CONTRACT_ADDRESS.toLowerCase();

        if (!granted) {
          writeCachedRole(walletAddress, null);
          setRole(null);
          setPendingRole(data.role);
          setAwaitingApproval(data.roleApproved !== true);
          setStatus('pending');
          return;
        }

        writeCachedRole(walletAddress, data.role);
        setRole(data.role);
        setStatus('ready');
        fetch(`${AI_API_URL}/api/user/${walletAddress}/login`, { method: 'PATCH' }).catch(() => {});
      } catch (err) {
        if (cancelled) return;
        console.error('Role lookup failed', err);
        if (cachedRole) return; // keep the remembered role; it is checked again next load

        setStatus('error');
        setLoadError(
          timedOut
            ? 'The BioToken server did not answer in time. It may still be starting up — try again in a moment.'
            : err instanceof TypeError
              ? `Could not reach the BioToken server at ${AI_API_URL}. Check that it is running.`
              : err.message || 'Could not load your account.'
        );
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
        if (!cancelled) setSlow(false);
      }
    };

    lookUpRole();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    };
    // txWallet is read through walletAddress; the wallets array changes identity often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, walletAddress, reloadKey]);

  // ── Register (or change) the role ────────────────────────────────
  const selectRole = useCallback(async (selectedRole) => {
    if (!txWallet) throw new Error('No wallet connected');

    setIsRegistering(true);
    setRegisterError(null);

    try {
      // The wallet signs the request; the API grants the role to the smart
      // account that sends this user's gasless transactions.
      const smartAccountAddress = await getSmartAccountAddress(txWallet);
      const issuedAt = Math.floor(Date.now() / 1000);
      const message = registrationMessage(selectedRole, txWallet.address, smartAccountAddress, issuedAt);
      const provider = await txWallet.getEthereumProvider();
      const signature = await provider.request({
        method: 'personal_sign',
        params: [ethers.hexlify(ethers.toUtf8Bytes(message)), txWallet.address],
      });

      const res = await fetch(`${AI_API_URL}/register-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: txWallet.address,
          role: selectedRole,
          smart_account_address: smartAccountAddress,
          issued_at: issuedAt,
          signature,
        }),
      });
      if (!res.ok) throw new Error(await errorDetail(res).catch(() => `Registration failed (${res.status})`));
      const body = await res.json();

      setChoosingRole(false);
      setLoadError(null);
      if (body.pending) {
        // Waiting for an administrator; the pending screen explains this.
        writeCachedRole(txWallet.address, null);
        setRole(null);
        setPendingRole(selectedRole);
        setAwaitingApproval(true);
        setStatus('pending');
        return;
      }

      writeCachedRole(txWallet.address, selectedRole);
      setRole(selectedRole);
      setPendingRole(null);
      setAwaitingApproval(false);
      setStatus('ready');
    } catch (err) {
      setRegisterError(err.message);
      throw err; // RoleSelection shows the error and stays on screen
    } finally {
      setIsRegistering(false);
    }
  }, [txWallet]);

  // Re-registering repairs every not-granted case (failed grant, old EOA
  // grant, previous deployment) and keeps an existing admin approval.
  const retryRoleGrant = useCallback(async () => {
    if (!pendingRole) return;
    await selectRole(pendingRole).catch(() => {});
  }, [pendingRole, selectRole]);

  const refresh = useCallback(() => setReloadKey(k => k + 1), []);
  const changeRole = useCallback(() => {
    setRegisterError(null);
    setChoosingRole(true);
  }, []);
  const cancelChangeRole = useCallback(() => {
    setRegisterError(null);
    setChoosingRole(false);
  }, []);

  const value = useMemo(() => ({
    status,
    role,
    pendingRole,
    awaitingApproval,
    rolePendingOnChain: status === 'pending',
    needsRoleSelection: status === 'needs-role' || choosingRole,
    choosingRole,
    roleLoading: status === 'checking' || status === 'waiting-wallet',
    slow,
    loadError,
    isRegistering,
    registerError,
    selectRole,
    retryRoleGrant,
    refresh,
    changeRole,
    cancelChangeRole,
  }), [status, role, pendingRole, awaitingApproval, choosingRole, slow, loadError,
       isRegistering, registerError, selectRole, retryRoleGrant, refresh, changeRole, cancelChangeRole]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
