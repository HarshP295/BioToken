// frontend/src/pages/Dashboard.jsx — full redesign
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw, ArrowRight, Package, Info,
  FlaskConical, Truck, CheckCircle2, ShieldCheck, Beaker,
} from 'lucide-react';
import StatusBadge, { STAGES } from '../components/StatusBadge';
import DNABackground from '../components/DNABackground';

import { useAuth } from '../hooks/useAuth';
import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config';

/* ── status meta ─────────────────────────────────────────────── */
const STATUS_META = [
  { color: '#4F46E5', bg: 'rgba(79,70,229,0.08)',   border: '#4F46E5', label: 'MINTED',     icon: <Package     size={16} />, emoji: '🔷' },
  { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: '#F59E0B', label: 'IN TRANSIT', icon: <Truck       size={16} />, emoji: '🚚' },
  { color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: '#6B7280', label: 'RECEIVED',   icon: <CheckCircle2 size={16} />, emoji: '📦' },
  { color: '#00C896', bg: 'rgba(0,200,150,0.08)',   border: '#00C896', label: 'VERIFIED',   icon: <ShieldCheck  size={16} />, emoji: '✅' },
  { color: '#FF4D4D', bg: 'rgba(255,77,77,0.08)',   border: '#FF4D4D', label: 'CONSUMED',   icon: <Beaker       size={16} />, emoji: '🧪' },
];

/* ── animated counter ─────────────────────────────────────────── */
function CountUp({ target, duration = 800 }) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const start = performance.now();
    const step  = (now) => {
      const p   = Math.min((now - start) / duration, 1);
      setVal(Math.round(p * target));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return <>{val}</>;
}

/* ── stat cards row ──────────────────────────────────────────── */
function StatsRow({ tokens }) {
  const total = tokens.length;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: '1rem',
      marginBottom: '2.5rem',
    }}
      className="stats-row"
    >
      {STATUS_META.map((m, i) => {
        const count = tokens.filter(t => Number(t.status) === i).length;
        return (
          <div
            key={m.label}
            className="stat-tile animate-fade-up"
            style={{
              '--anim-delay': `${i * 0.08}s`,
              '--status-color': m.color,
              borderLeft: `3px solid ${m.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ color: m.color }}>{m.icon}</span>
              <span style={{
                fontFamily: "'Courier New', monospace",
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: m.color,
              }}>{m.label}</span>
            </div>
            <div style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: '3rem',
              fontWeight: 700,
              color: '#0d1f1a',
              lineHeight: 1,
              marginBottom: '0.5rem',
            }}>
              <CountUp target={count} />
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              gap: '0.3rem',
              padding: '0.22rem 0.65rem',
              borderRadius: '9999px',
              background: m.bg,
              border: `1px solid ${m.color}30`,
              fontFamily: "'Courier New', monospace",
              fontSize: '0.65rem',
              fontWeight: 600,
              color: m.color,
            }}>
              {total > 0 ? `${Math.round((count / total) * 100)}%` : '0%'} of total
            </div>
          </div>
        );
      })}
      <style>{`
        .stat-tile {
          background: #ffffff;
          border-radius: 16px;
          padding: 1.5rem 1.25rem;
          box-shadow: 0 4px 24px rgba(0,0,0,0.07);
          animation: fadeUp 0.5s ease-out var(--anim-delay, 0s) both;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .stat-tile:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.10);
        }
        @media (max-width: 900px) {
          .stats-row { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .stats-row { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

/* ── batch NFT card — original style with updated fonts ─────── */
function TokenCard({ token }) {
  const stageIdx  = Number(token.status);
  const accentVar = ['--chain', '--warning', '--text-muted', '--accent', '--alert'][stageIdx] || '--text-muted';
  const expDate   = new Date(token.expiry * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const isExpired = token.expiry * 1000 < Date.now();

  return (
    <Link
      to={`/details?id=${token.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div className="lab-card" style={{ borderLeft: `3px solid var(${accentVar})` }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div style={{
              fontFamily: "'Libre Baskerville', serif",
              fontWeight: 700,
              fontSize: '1.05rem',
              color: 'var(--text)',
              marginBottom: '0.25rem',
            }}>
              {token.batchId}
            </div>
            <span className="mono-tag">Token #{token.id}</span>
          </div>
          <StatusBadge status={token.status} />
        </div>

        {/* Progress bar */}
        <div style={{ margin: '1rem 0', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${((stageIdx + 1) / STAGES.length) * 100}%`,
            background: `var(${accentVar})`,
            borderRadius: 2,
            transition: 'width 0.5s ease',
          }} />
        </div>

        {/* Footer row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '0.75rem',
          fontSize: '0.76rem',
          fontFamily: "'Courier New', monospace",
        }}>
          <div style={{ color: 'var(--text-muted)' }}>
            Owner: <span className="mono-address">{token.owner.substring(0, 8)}…{token.owner.substring(38)}</span>
          </div>
          <div style={{ color: isExpired ? 'var(--alert)' : 'var(--text-faint)' }}>
            {isExpired ? '⚠ EXPIRED' : `Exp. ${expDate}`}
          </div>
        </div>

        {/* Hover arrow */}
        <div style={{
          position: 'absolute', top: '50%', right: '1.25rem', transform: 'translateY(-50%)',
          color: 'var(--text-faint)', opacity: 0.4, transition: 'opacity 0.2s',
        }}>
          <ArrowRight size={16} />
        </div>
      </div>
    </Link>
  );
}

/* ── filter tab bar ──────────────────────────────────────────── */
function FilterTabs({ active, onChange }) {
  const tabs = [{ id: null, label: 'ALL' }, ...STAGES.map(s => ({ id: s.id, label: s.name }))];
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id ?? 'all'}
            onClick={() => onChange(tab.id)}
            style={{
              padding: '0.45rem 1.1rem',
              borderRadius: '9999px',
              border: `1.5px solid ${isActive ? '#00C896' : '#e0ede9'}`,
              background: isActive ? '#00C896' : 'transparent',
              color: isActive ? '#ffffff' : '#0d1f1a',
              fontFamily: "'Playfair Display', serif",
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              letterSpacing: '0.04em',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.borderColor = '#00C896';
                e.currentTarget.style.color = '#00A87E';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.borderColor = '#e0ede9';
                e.currentTarget.style.color = '#0d1f1a';
              }
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── empty state ─────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '5rem 2rem',
      border: '2px dashed #c8ddd8',
      borderRadius: '16px',
      background: 'rgba(255,255,255,0.7)',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        width: 70, height: 70, borderRadius: '50%',
        background: 'rgba(0,200,150,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.5rem',
        color: '#00C896',
      }}>
        <FlaskConical size={30} />
      </div>
      <h3 style={{
        fontFamily: "'Libre Baskerville', serif",
        fontSize: '1.4rem', fontWeight: 700,
        color: '#0d1f1a', marginBottom: '0.5rem',
      }}>
        No Batches Found
      </h3>
      <p style={{
        fontFamily: "'Playfair Display', serif",
        color: '#6B7280', fontSize: '0.95rem',
        marginBottom: '2rem',
      }}>
        No tokens exist on this network yet. Mint the first reagent batch NFT.
      </p>
      <Link to="/mint" style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.8rem 1.75rem', borderRadius: '9999px',
        background: '#00C896', color: '#ffffff',
        fontFamily: "'Playfair Display', serif",
        fontWeight: 600, fontSize: '0.9rem',
        textDecoration: 'none',
        boxShadow: '0 8px 24px rgba(0,200,150,0.2)',
        transition: 'all 0.2s ease',
      }}>
        <Package size={16} /> Mint First Batch <ArrowRight size={16} />
      </Link>
    </div>
  );
}

/* ── unauthenticated state ────────────────────────────────────── */
function UnauthState() {
  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center',
      position: 'relative',
      zIndex: 1,
      padding: '4rem 1.5rem',
    }}>
      <div style={{
        width: 90, height: 90, borderRadius: '50%',
        background: 'rgba(0,200,150,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 2rem',
        color: '#00C896',
        boxShadow: '0 0 0 16px rgba(0,200,150,0.04)',
        animation: 'pulseDot 2.2s ease-in-out infinite',
      }}>
        <FlaskConical size={40} />
      </div>
      <h1 style={{
        fontFamily: "'Libre Baskerville', serif",
        fontSize: '2.6rem', fontWeight: 700,
        color: '#0d1f1a', marginBottom: '0.75rem',
      }}>Lab Dashboard</h1>
      <p style={{
        fontFamily: "'Playfair Display', serif",
        color: '#6B7280', fontSize: '1.05rem',
        maxWidth: 420, margin: '0 auto 2.5rem',
        lineHeight: 1.8,
      }}>
        Connect your wallet to view and manage on-chain reagent batch tokens.
      </p>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        padding: '1rem 1.75rem',
        border: '1.5px dashed #c8ddd8',
        borderRadius: '16px',
        color: '#6B7280',
        fontFamily: "'Courier New', monospace",
        fontSize: '0.82rem',
        background: 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(8px)',
      }}>
        <Info size={16} /> Wallet disconnected — use Connect Wallet above
      </div>
    </div>
  );
}

/* ── Dashboard page ──────────────────────────────────────────── */
export default function Dashboard({ contract }) {
  const { ready, authenticated, user } = useAuth();
  const { wallets } = useWallets();
  const wallet  = wallets[0];
  const account = wallet?.address || user?.wallet?.address;

  const [tokens,      setTokens]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [stageFilter, setStageFilter] = useState(null);

  const getActiveContract = async () => {
    let c = contract;
    if (!c) {
      if (wallet) {
        const prov   = await wallet.getEthereumProvider();
        const bp     = new ethers.BrowserProvider(prov);
        const signer = await bp.getSigner();
        c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      } else {
        const fp = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology');
        c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, fp);
      }
    }
    return c;
  };

  const loadTokens = async () => {
    if (!authenticated) return;
    try {
      setLoading(true); setError('');
      const c = await getActiveContract();
      const fetched = [];
      for (let i = 0; i < 30; i++) {
        try {
          const owner = await c.ownerOf(i);
          const data  = await c.getTokenData(i);
          fetched.push({ id: i, owner, batchId: data.batchId, expiry: Number(data.expiry), status: Number(data.status) });
        } catch { break; }
      }
      setTokens(fetched.reverse());
    } catch (err) {
      console.error(err);
      setError('Failed to load tokens from contract.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTokens(); }, [contract, authenticated, wallet]);

  const filtered = stageFilter === null
    ? tokens
    : tokens.filter(t => Number(t.status) === stageFilter);

  return (
    <>
      {/* 3D DNA animated background */}
      <DNABackground />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '3rem 48px 5rem',
        }} className="dashboard-wrap">

          {!authenticated ? (
            <UnauthState />
          ) : (
            <>
              {/* ── Page Header ── */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '2.5rem',
                flexWrap: 'wrap',
                gap: '1.25rem',
              }}>
                <div className="animate-fade-up">
                  <div style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: '#00C896',
                    marginBottom: '0.6rem',
                  }}>MANUFACTURER VIEW</div>
                  <h1 style={{
                    fontFamily: "'Libre Baskerville', serif",
                    fontSize: '3rem',
                    fontWeight: 700,
                    color: '#0d1f1a',
                    lineHeight: 1.1,
                    marginBottom: '0.5rem',
                  }}>Reagent Dashboard</h1>
                  <p style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '1.05rem',
                    color: '#6B7280',
                    lineHeight: 1.7,
                  }}>
                    All on-chain reagent batch NFTs — live from Polygon.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }} className="animate-fade-up anim-delay-1">
                  <Link to="/mint" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '9999px',
                    background: '#00C896', color: '#ffffff',
                    fontFamily: "'Playfair Display', serif",
                    fontWeight: 600, fontSize: '0.88rem',
                    textDecoration: 'none',
                    boxShadow: '0 8px 24px rgba(0,200,150,0.2)',
                    transition: 'all 0.2s ease',
                  }}>
                    <Package size={15} /> Mint New
                  </Link>
                  <button
                    onClick={loadTokens}
                    disabled={loading}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '9999px',
                      background: 'transparent',
                      border: '1.5px solid #0d1f1a',
                      color: '#0d1f1a',
                      fontFamily: "'Playfair Display', serif",
                      fontWeight: 600, fontSize: '0.88rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <RefreshCw size={15} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* ── Stats Row ── */}
              {tokens.length > 0 && <StatsRow tokens={tokens} />}

              {/* ── Error ── */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  padding: '1rem 1.25rem',
                  background: 'rgba(255,77,77,0.06)',
                  border: '1px solid rgba(255,77,77,0.2)',
                  borderLeft: '3px solid #FF4D4D',
                  borderRadius: '12px',
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '0.9rem',
                  color: '#991B1B',
                  marginBottom: '1.5rem',
                }}>
                  <Info size={16} /> {error}
                </div>
              )}

              {/* ── Content ── */}
              {loading && tokens.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '6rem 0' }}>
                  <div style={{
                    width: 40, height: 40,
                    border: '3px solid #e0ede9',
                    borderTop: '3px solid #00C896',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                </div>
              ) : tokens.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <FilterTabs active={stageFilter} onChange={setStageFilter} />
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '1.25rem',
                  }}>
                    {filtered.map(token => (
                      <TokenCard key={token.id} token={token} />
                    ))}
                  </div>
                  {filtered.length === 0 && (
                    <p style={{
                      textAlign: 'center',
                      color: '#6B7280',
                      fontFamily: "'Playfair Display', serif",
                      fontSize: '1rem',
                      padding: '3rem',
                    }}>
                      No batches in this stage yet.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .dashboard-wrap { padding: 2rem 1.25rem 4rem !important; }
        }
      `}</style>
    </>
  );
}
