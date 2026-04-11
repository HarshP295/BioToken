import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowRight, FlaskConical, Package, Info } from 'lucide-react';
import StatusBadge, { STAGES } from '../components/StatusBadge';
import MoleculeBackground from '../components/MoleculeBackground';

const STATUS_CARD_ACCENT = ['--chain', '--warning', '--text-muted', '--accent', '--alert'];

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '5rem 2rem',
      border: '2px dashed var(--border)',
      borderRadius: 'var(--radius-xl)',
      background: 'var(--surface)',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(0,200,150,0.08)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.5rem', color: 'var(--accent)',
      }}>
        <FlaskConical size={28} />
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        No Batches Found
      </h3>
      <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.75rem' }}>
        No tokens exist on this network yet. Mint the first one.
      </p>
      <Link to="/mint" className="btn btn-accent">
        <Package size={15} /> Mint First Batch <ArrowRight size={15} />
      </Link>
    </div>
  );
}

function TokenCard({ token }) {
  const stageIdx = Number(token.status);
  const accentVar = STATUS_CARD_ACCENT[stageIdx] || '--text-muted';
  const expDate = new Date(token.expiry * 1000).toLocaleDateString('en-US', {
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
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>
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

function StageFilter({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      <button
        className={`btn ${active === null ? 'btn-primary' : 'btn-secondary'}`}
        style={{ padding: '0.35rem 0.9rem', fontSize: '0.75rem' }}
        onClick={() => onChange(null)}
      >All</button>
      {STAGES.map(s => (
        <button
          key={s.id}
          className={`btn ${active === s.id ? 'btn-accent' : 'btn-secondary'}`}
          style={{ padding: '0.35rem 0.9rem', fontSize: '0.75rem' }}
          onClick={() => onChange(s.id)}
        >{s.name}</button>
      ))}
    </div>
  );
}

export default function Dashboard({ contract, account }) {
  const [tokens, setTokens]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [stageFilter, setStageFilter] = useState(null);

  const loadTokens = async () => {
    if (!contract || !account) return;
    try {
      setLoading(true); setError('');
      const fetched = [];
      for (let i = 0; i < 30; i++) {
        try {
          const owner = await contract.ownerOf(i);
          const data  = await contract.getTokenData(i);
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

  useEffect(() => { loadTokens(); }, [contract, account]);

  const filtered = stageFilter === null ? tokens : tokens.filter(t => Number(t.status) === stageFilter);

  if (!account) {
    return (
      <div style={{
        textAlign: 'center', paddingTop: '6rem', paddingBottom: '6rem',
        position: 'relative', minHeight: '80vh', overflow: 'hidden',
      }}>
        {/* Molecular structure animation fills the background */}
        <MoleculeBackground style={{ opacity: 0.85 }} />

        {/* Content — floats above the canvas */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 82, height: 82, borderRadius: '50%',
            background: 'rgba(79,70,229,0.08)', color: 'var(--chain)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
            boxShadow: '0 0 0 14px rgba(79,70,229,0.04)',
            animation: 'pulseDot 2.2s ease-in-out infinite',
          }}>
            <FlaskConical size={36} />
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: 700,
            color: 'var(--text)', marginBottom: '0.5rem',
          }}>Lab Dashboard</h1>
          <p style={{
            fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.9rem',
            maxWidth: 400, margin: '0 auto 2rem', lineHeight: 1.7,
          }}>
            Connect your MetaMask wallet to view and manage reagent batch tokens.
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.9rem 1.5rem', border: '1.5px dashed var(--border)',
            borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
            background: 'rgba(248,247,244,0.75)', backdropFilter: 'blur(8px)',
          }}>
            <Info size={16} /> Wallet disconnected — use Connect Wallet in the navbar
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="page-content animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="section-label">Lab View</div>
          <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Reagent Dashboard</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            All on-chain reagent batch NFTs — live from Polygon.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link to="/mint" className="btn btn-accent" style={{ fontSize: '0.8rem', padding: '0.6rem 1.2rem' }}>
            <Package size={14} /> Mint New
          </Link>
          <button
            onClick={loadTokens}
            disabled={loading}
            className="btn btn-outline"
            style={{ fontSize: '0.8rem', padding: '0.6rem 1.2rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {tokens.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem', marginBottom: '2rem',
        }}>
          {STAGES.map(s => {
            const count = tokens.filter(t => Number(t.status) === s.id).length;
            return (
              <div key={s.id} className="lab-card" style={{ padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--text)' }}>{count}</div>
                <StatusBadge status={s.id} />
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="alert-banner alert-banner--error">
          <Info size={16} /> {error}
        </div>
      )}

      {loading && tokens.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6rem 0' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : tokens.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <StageFilter active={stageFilter} onChange={setStageFilter} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {filtered.map(token => <TokenCard key={token.id} token={token} />)}
          </div>
          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', padding: '3rem' }}>
              No batches in this stage yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
