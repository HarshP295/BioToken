// frontend/src/pages/TokenDetails.jsx
import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Send, CheckCircle2, Info, ShieldCheck, Beaker } from 'lucide-react';
import StatusBadge, { STAGES } from '../components/StatusBadge';

import { useAuth } from '../hooks/useAuth';
import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config';
import { useGaslessContract } from '../hooks/useGaslessContract';

const LIFECYCLE = [
  { id: 0, label: 'Minted',              color: 'var(--chain)',   action: 'transfer', actionLabel: 'Transit to Lab', icon: <Send size={13} /> },
  { id: 1, label: 'In Transit',          color: 'var(--warning)', action: 'receive',  actionLabel: 'Confirm Receipt', icon: <CheckCircle2 size={13} /> },
  { id: 2, label: 'Received by Lab',     color: 'var(--text-muted)', action: 'verify', actionLabel: 'Run Verification', icon: <ShieldCheck size={13} />, isLink: true },
  { id: 3, label: 'Authenticity Verified', color: 'var(--accent)',  action: 'consume', actionLabel: 'Consume Reagent', icon: <Beaker size={13} /> },
  { id: 4, label: 'Consumed',            color: 'var(--alert)',    action: null, actionLabel: null },
];

export default function TokenDetails({ contract }) {
  const [searchParams] = useSearchParams();
  const tokenId = searchParams.get('id');

  const { ready, authenticated, user, createWallet } = useAuth();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const account = wallet?.address || user?.wallet?.address;

  const [token,         setToken]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error,         setError]         = useState('');

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
        const fallbackProvider = new ethers.JsonRpcProvider("https://rpc-amoy.polygon.technology");
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

  const handleAction = async (actionType) => {
    try {
      setActionLoading(true);
      if (!wallet) {
        if (createWallet && !user?.wallet) {
          try {
            await createWallet();
            return;
          } catch (err) {
            alert('Failed to connect wallet');
            return;
          }
        }
        alert('No active wallet found. Please refresh or log in again.');
        return;
      }
      
      const activeContract = await getActiveContract();
      let tx;
      if (actionType === 'transfer') {
        tx = await activeContract.transferCustody(tokenId, '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199');
      } else if (actionType === 'receive') {
        tx = await activeContract.confirmReceipt(tokenId);
      } else if (actionType === 'consume') {
        tx = await activeContract.consumeToken(tokenId);
      }
      await tx.wait();
      await loadData();
    } catch (err) {
      console.error(err);
      alert(err.reason || err.message);
    } finally {
      setActionLoading(false);
    }
  };

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
          <button onClick={loadData} disabled={actionLoading} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} />
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

          {token.vkHash && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
              <div className="form-label" style={{ marginBottom: '0.35rem' }}>Verification Key Commitment</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)',
                background: 'var(--surface-alt)', padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                wordBreak: 'break-all', lineHeight: 1.6,
              }}>{token.vkHash}</div>
            </div>
          )}
        </div>

        {/* Lifecycle */}
        <div style={{ marginBottom: '0.75rem' }}>
          <div className="section-label">Lifecycle Actions</div>
        </div>

        <div className="lab-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {LIFECYCLE.map((stage) => {
              const done    = statusNum > stage.id;
              const current = statusNum === stage.id;
              const pending = statusNum < stage.id;

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

                  {current && stage.action && (
                    stage.isLink
                      ? (
                        <Link to={`/verify?id=${tokenId}`} className="btn btn-accent" style={{ padding: '0.4rem 1rem', fontSize: '0.76rem' }}>
                          {stage.icon} {stage.actionLabel}
                        </Link>
                      )
                      : (
                        <button
                          className="btn btn-outline"
                          style={{ padding: '0.4rem 1rem', fontSize: '0.76rem' }}
                          onClick={() => handleAction(stage.action)}
                          disabled={actionLoading}
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

        {!authenticated && (
          <div className="alert-banner alert-banner--warning" style={{ marginTop: '1.5rem' }}>
            <Info size={16} /> Log in to perform lifecycle actions on this token.
          </div>
        )}
      </div>
    </div>
  );
}
