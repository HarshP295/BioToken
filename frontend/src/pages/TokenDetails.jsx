// frontend/src/pages/TokenDetails.jsx
import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Send, CheckCircle2, Info, ShieldCheck, Beaker, ShieldAlert, Copy, Check } from 'lucide-react';
import StatusBadge, { STAGES } from '../components/StatusBadge';
import { useZKProof } from '../zkp/useZKProof';

import { useAuth } from '../hooks/useAuth';
import { useRole } from '../hooks/useRole';
import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { AMOY_RPC_URL, CONTRACT_ADDRESS, CONTRACT_ABI } from '../config';
import { useGaslessContract } from '../hooks/useGaslessContract';

const LIFECYCLE = [
  { id: 0, label: 'Minted',              color: 'var(--chain)',   action: 'transfer', actionLabel: 'Transit to Lab', icon: <Send size={13} /> },
  { id: 1, label: 'In Transit',          color: 'var(--warning)', action: 'receive',  actionLabel: 'Confirm Receipt', icon: <CheckCircle2 size={13} /> },
  { id: 2, label: 'Received by Lab',     color: 'var(--text-muted)', action: 'verify', actionLabel: 'Run Verification', icon: <ShieldCheck size={13} />, isLink: true },
  { id: 3, label: 'Authenticity Verified', color: 'var(--accent)',  action: 'consume', actionLabel: 'Consume Reagent', icon: <Beaker size={13} /> },
  { id: 4, label: 'Consumed',            color: 'var(--alert)',    action: null, actionLabel: null },
];

// Stages owned by each role
const MANUFACTURER_STAGES = new Set([0, 1]); // Minted, In Transit
const LAB_STAGES          = new Set([2, 3, 4]); // Received, Verified, Consumed

export default function TokenDetails({ contract }) {
  const [searchParams] = useSearchParams();
  const tokenId = searchParams.get('id');

  const { ready, authenticated, user, createWallet } = useAuth();
  const { role } = useRole();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const account = wallet?.address || user?.wallet?.address;

  const [token,         setToken]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error,         setError]         = useState('');
  const [copied,        setCopied]        = useState(false);

  // ── ZK proof hook (declarative — runs automatically for verified tokens) ──
  const { commitment: zkCommitment, isVerified: zkVerified, isLoading: zkLoading } = useZKProof(
    token?.id,
    token?.batchId,
    token?.rawExpiry,
    token?.status
  );

  const getActiveContract = async () => {
    let activeContract = contract;
    if (!activeContract) {
      // For read-only calls we only need a public provider but if authenticated, we get the signer
      if (wallet) {
        const provider = await wallet.getEthereumProvider();
        const browserProvider = new ethers.BrowserProvider(provider);
        const signer = await browserProvider.getSigner();
        activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      } else {
        const fallbackProvider = new ethers.JsonRpcProvider(AMOY_RPC_URL);
        activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, fallbackProvider);
      }
    }
    return activeContract;
  };

  const loadData = async () => {
    if (!tokenId) return;
    try {
      setLoading(true); setError('');
      const activeContract = await getActiveContract();
      const owner = await activeContract.ownerOf(tokenId);
      const data  = await activeContract.getTokenData(tokenId);
      setToken({
        id: tokenId, owner,
        batchId: data.batchId,
        expiry: new Date(Number(data.expiry) * 1000).toLocaleString(),
        rawExpiry: data.expiry,
        status: Number(data.status),
        vkHash: data.verificationKey,
      });
    } catch (err) {
      console.error(err);
      setError('Token not found or error loading data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [contract, tokenId, wallet]);



  // Copy commitment to clipboard
  const handleCopyCommitment = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const { sendGaslessTx, loading: gaslessLoading } = useGaslessContract();

  const handleAction = async (actionType) => {
    if (!authenticated) {
      alert('Please log in first.')
      return
    }
    if (!wallet) {
      alert('No wallet found. Please refresh or log in again.')
      return
    }

    try {
      setActionLoading(true)
      setError('')

      if (actionType === 'transfer') {
        // Transfer custody to the deployer/logistics address
        // In production this would be the courier's address
        await sendGaslessTx('transferCustody', [
          BigInt(tokenId),
          '0xbb6E66Fb872cFd173d12a402b11316aab72189B4'
        ])

      } else if (actionType === 'receive') {
        await sendGaslessTx('confirmReceipt', [BigInt(tokenId)])

      } else if (actionType === 'consume') {
        const confirmed = window.confirm(
          'Are you sure you want to consume this reagent? This action is irreversible and the token will be permanently marked as CONSUMED.'
        )
        if (!confirmed) {
          setActionLoading(false)
          return
        }
        await sendGaslessTx('consumeToken', [BigInt(tokenId)])
      }

      // Reload token data after action
      await loadData()

    } catch (err) {
      console.error('Action failed:', err)
      setError(err.reason || err.message || 'Transaction failed.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: '6rem 0' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="page-content" style={{ textAlign: 'center', paddingTop: '5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', marginBottom: '1.25rem' }}>Token Not Found</h2>
        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '1.75rem', fontSize: '0.85rem' }}>
          {error || 'This token ID does not exist on the connected network.'}
        </p>
        <Link to="/dashboard" className="btn btn-outline">← Back to Dashboard</Link>
      </div>
    );
  }

  const statusNum = token.status;

  return (
    <div className="page-content animate-fade-in">
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* Nav row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <Link to="/dashboard" className="btn btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.78rem' }}>
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <button onClick={loadData} disabled={actionLoading || gaslessLoading} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            <RefreshCw size={14} className={actionLoading || gaslessLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Header card */}
        <div className="lab-card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent)' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            paddingBottom: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap', gap: '1rem',
          }}>
            <div>
              <div className="section-label" style={{ marginBottom: '0.25rem' }}>Token #{token.id}</div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                {token.batchId}
              </h1>
            </div>
            <StatusBadge status={token.status} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div>
              <div className="form-label" style={{ marginBottom: '0.35rem' }}>Current Owner</div>
              <div className="mono-address" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>{token.owner}</div>
            </div>
            <div>
              <div className="form-label" style={{ marginBottom: '0.35rem' }}>Expiry Date</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: 'var(--text)' }}>{token.expiry}</div>
            </div>
            <div>
              <div className="form-label" style={{ marginBottom: '0.35rem' }}>Network</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: 'var(--text)' }}>Polygon Amoy</div>
            </div>
          </div>

          {/* ── VK Commitment with real Poseidon hash ── */}
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
            <div className="form-label" style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Verification Key Commitment
              <span
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'help',
                }}
                title="Poseidon hash of reagent fingerprint — Groth16 verified"
              >
                <Info size={13} style={{ color: 'var(--text-faint)', opacity: 0.6 }} />
              </span>
            </div>

            {zkLoading ? (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)',
                background: 'var(--surface-alt)', padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                fontStyle: 'italic',
              }}>
                Generating ZK commitment...
              </div>
            ) : (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)',
                background: 'var(--surface-alt)', padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                wordBreak: 'break-all', lineHeight: 1.6,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '0.5rem',
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {zkCommitment || token.vkHash || '0x' + '0'.repeat(64)}
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCopyCommitment(zkCommitment || token.vkHash || '');
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: copied ? 'var(--accent)' : 'var(--text-faint)',
                    padding: '4px', borderRadius: '4px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'color 0.2s',
                    flexShrink: 0,
                  }}
                  title="Copy commitment hash"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}

            {zkVerified && !zkLoading && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                marginTop: '0.5rem',
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                color: 'var(--accent-dim)',
              }}>
                <ShieldCheck size={13} />
                Groth16 proof verified
              </div>
            )}
          </div>
        </div>

        {/* Lifecycle */}
        <div style={{ marginBottom: '0.75rem' }}>
          <div className="section-label">Lifecycle Actions</div>
        </div>

        <div className="lab-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {LIFECYCLE
              // Each role sees only their portion of the pipeline
              .filter(stage =>
                role === 'manufacturer' ? MANUFACTURER_STAGES.has(stage.id)
                : role === 'lab'        ? LAB_STAGES.has(stage.id)
                : true                 // unauthenticated — show all (read-only)
              )
              .map((stage) => {
                const done    = statusNum > stage.id;
                const current = statusNum === stage.id;
                const pending = statusNum < stage.id;

                // Determine whether the action button should be shown for this role
                const canAct =
                  current &&
                  stage.action &&
                  (role === 'manufacturer' ? MANUFACTURER_STAGES.has(stage.id)
                   : role === 'lab'        ? LAB_STAGES.has(stage.id)
                   : false);

                return (
                  <div key={stage.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.9rem 1.1rem',
                    borderRadius: 'var(--radius-md)',
                    border: current
                      ? `1px solid ${stage.color}`
                      : done ? '1px solid var(--border)' : '1px solid var(--border)',
                    background: current ? `color-mix(in srgb, ${stage.color} 6%, transparent)` : 'transparent',
                    opacity: pending ? 0.45 : 1,
                    transition: 'all 0.2s',
                    flexWrap: 'wrap', gap: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: done || current ? stage.color : 'var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', flexShrink: 0,
                      }}>
                        <CheckCircle2 size={14} />
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
                          {stage.id + 1}. {stage.label}
                        </div>
                      </div>
                    </div>

                    {canAct && (
                      stage.isLink
                        ? (
                          <Link to={`/lab?verify=${tokenId}`} className="btn btn-accent" style={{ padding: '0.4rem 1rem', fontSize: '0.76rem' }}>
                            {stage.icon} {stage.actionLabel}
                          </Link>
                        )
                        : (
                          <button
                            className="btn btn-outline"
                            style={{ padding: '0.4rem 1rem', fontSize: '0.76rem' }}
                            onClick={() => handleAction(stage.action)}
                            disabled={actionLoading || gaslessLoading}
                          >
                            {stage.icon} {stage.actionLabel}
                          </button>
                        )
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {error && (
          <div className="alert-banner alert-banner--error" style={{ marginTop: '1rem' }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}

        {!authenticated && (
          <div className="alert-banner alert-banner--warning" style={{ marginTop: '1.5rem' }}>
            <Info size={16} /> Log in to perform lifecycle actions on this token.
          </div>
        )}
      </div>
    </div>
  );
}
