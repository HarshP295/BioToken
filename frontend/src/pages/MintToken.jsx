// frontend/src/pages/MintToken.jsx — full redesign
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useAuth } from '../hooks/useAuth';
import { useWallets } from '@privy-io/react-auth';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config';
import {
  Upload, PackageCheck, AlertCircle,
  CheckCircle2, Clock, Hash, Server,
} from 'lucide-react';
import { useGaslessContract } from '../hooks/useGaslessContract';
import { getBaselinePeers, getPeerMeans } from '../lib/consensusValidator';
import DNABackground from '../components/DNABackground';

/* ── card wrapper ─────────────────────────────────────────────── */
function SectionCard({ children, style = {}, animDelay = 0 }) {
  return (
    <div
      className="mint-section-card animate-fade-up"
      style={{
        '--anim-delay': `${animDelay}s`,
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e0ede9',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        padding: '2rem',
        marginBottom: '1.5rem',
        ...style,
      }}
    >
      {children}
      <style>{`.mint-section-card { animation: fadeUp 0.5s ease-out var(--anim-delay, 0s) both; }`}</style>
    </div>
  );
}

/* ── card heading ─────────────────────────────────────────────── */
function CardHeading({ children, withDot = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      marginBottom: '1.5rem',
    }}>
      {withDot && (
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: '#00C896',
          boxShadow: '0 0 0 3px rgba(0,200,150,0.2)',
          flexShrink: 0,
          animation: 'validatorPulse 2s ease-in-out infinite',
        }} />
      )}
      <h2 style={{
        fontFamily: "'Libre Baskerville', serif",
        fontSize: '1.1rem', fontWeight: 700,
        color: '#0d1f1a',
      }}>{children}</h2>
    </div>
  );
}

/* ── Card 1: Consensus Validators ──────────────────────────── */
function ValidatorCard({ animDelay, consensusResult }) {
  const peers = getBaselinePeers();
  const means = getPeerMeans();

  return (
    <SectionCard animDelay={animDelay}>
      <CardHeading withDot>Consensus Validators</CardHeading>

      {/* Baseline peers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '1rem' }}>
        {peers.map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.6rem 0.85rem',
            background: 'rgba(0,200,150,0.04)',
            borderRadius: '10px',
            border: '1px solid rgba(0,200,150,0.12)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#00C896', flexShrink: 0,
              animation: 'validatorPulse 2s ease-in-out infinite',
            }} />
            <CheckCircle2 size={14} color="#00C896" />
            <div style={{ flex: 1 }}>
              <span style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '0.85rem', fontWeight: 600, color: '#0d1f1a',
              }}>{p.supplier}</span>
              <div style={{
                fontFamily: "'Courier New', monospace",
                fontSize: '0.62rem', color: '#9CA3AF',
                marginTop: '0.15rem', letterSpacing: '0.02em',
              }}>
                [{p.peaks.slice(0, 5).join(', ')}, …]
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Peer mean */}
      <div style={{
        padding: '0.6rem 0.85rem',
        background: '#f7fbf9',
        borderRadius: '8px',
        border: '1px solid #e0ede9',
        marginBottom: '0.75rem',
      }}>
        <div style={{
          fontFamily: "'Courier New', monospace",
          fontSize: '0.6rem', fontWeight: 700,
          color: '#6B7280', textTransform: 'uppercase',
          letterSpacing: '0.1em', marginBottom: '0.25rem',
        }}>PEER MEAN (±50 TOLERANCE)</div>
        <div style={{
          fontFamily: "'Courier New', monospace",
          fontSize: '0.72rem', color: '#0d1f1a',
        }}>[{means.join(', ')}]</div>
      </div>

      {/* Per-peak results after mint attempt */}
      {consensusResult && (
        <div style={{
          padding: '0.6rem 0.85rem',
          borderRadius: '8px',
          background: consensusResult.passed ? 'rgba(0,200,150,0.05)' : 'rgba(255,77,77,0.05)',
          border: `1px solid ${consensusResult.passed ? 'rgba(0,200,150,0.2)' : 'rgba(255,77,77,0.2)'}`,
          marginBottom: '0.5rem',
        }}>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.6rem', fontWeight: 700,
            color: consensusResult.passed ? '#065F46' : '#991B1B',
            textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.4rem',
          }}>
            {consensusResult.passed ? '✓ ALL PEAKS WITHIN TOLERANCE' : '✗ CONSENSUS FAILED'}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '0.3rem',
          }}>
            {consensusResult.perPeak.map(p => (
              <div key={p.index} style={{
                textAlign: 'center',
                padding: '0.3rem 0.15rem',
                borderRadius: '6px',
                background: p.ok ? 'rgba(0,200,150,0.08)' : 'rgba(255,77,77,0.1)',
                border: `1px solid ${p.ok ? 'rgba(0,200,150,0.2)' : 'rgba(255,77,77,0.25)'}`,
              }}>
                <div style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: '0.55rem', color: '#9CA3AF',
                }}>P{p.index}</div>
                <div style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: '0.68rem', fontWeight: 700,
                  color: p.ok ? '#065F46' : '#991B1B',
                }}>Δ{p.delta}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginTop: '0.5rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid #e0ede9',
        fontFamily: "'Courier New', monospace",
        fontSize: '0.72rem',
        color: '#6B7280',
        letterSpacing: '0.05em',
      }}>
        {peers.length}/{peers.length} baseline peers · Polygon Amoy
      </div>

      <style>{`
        @keyframes validatorPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,200,150,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(0,200,150,0); }
        }
      `}</style>
    </SectionCard>
  );
}

/* ── Card 2: HPLC Upload ────────────────────────────────────── */
function UploadCard({ file, onFile, animDelay }) {
  const [dragging, setDragging] = useState(false);

  return (
    <SectionCard animDelay={animDelay}>
      <CardHeading>Upload HPLC Fingerprint</CardHeading>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => document.getElementById('fp-file-input').click()}
        style={{
          border: `2px dashed ${dragging ? '#00C896' : '#b8d8cf'}`,
          borderRadius: '12px',
          padding: '2.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'rgba(0,200,150,0.06)' : '#f7fbf9',
          transition: 'all 0.2s ease',
        }}
      >
        <input
          id="fp-file-input"
          type="file"
          accept=".csv,.json,.txt"
          style={{ display: 'none' }}
          onChange={e => onFile(e.target.files[0])}
        />
        {file ? (
          <>
            <CheckCircle2 size={36} style={{ color: '#00C896', margin: '0 auto 0.75rem' }} />
            <div style={{
              fontFamily: "'Libre Baskerville', serif",
              fontWeight: 700, fontSize: '1rem',
              color: '#0d1f1a', marginBottom: '0.3rem',
            }}>{file.name}</div>
            <div style={{
              fontFamily: "'Courier New', monospace",
              fontSize: '0.72rem', color: '#6B7280',
            }}>{(file.size / 1024).toFixed(1)} KB · Click to replace</div>
          </>
        ) : (
          <>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'rgba(0,200,150,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
              color: '#00C896',
            }}>
              <Upload size={24} />
            </div>
            <div style={{
              fontFamily: "'Libre Baskerville', serif",
              fontWeight: 700, fontSize: '1rem',
              color: '#0d1f1a', marginBottom: '0.4rem',
            }}>Drop HPLC fingerprint here</div>
            <div style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '0.85rem', color: '#6B7280',
            }}>
              or click to browse · CSV, JSON, TXT
            </div>
          </>
        )}
      </div>
      <p style={{
        marginTop: '0.75rem',
        fontFamily: "'Playfair Display', serif",
        fontSize: '0.8rem', color: '#9CA3AF',
        textAlign: 'center',
      }}>
        Accepted: .csv · .json · .txt — peak profile data only
      </p>
    </SectionCard>
  );
}

/* ── Card 3: NFT Preview ─────────────────────────────────────── */
function NFTPreviewCard({ batchId, expiryDays, animDelay }) {
  const expiry = new Date(Date.now() + expiryDays * 86400000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  const fields = [
    { label: 'Batch ID',  value: batchId || '—',       icon: <Hash size={14} /> },
    { label: 'Status',    value: 'MINTED',              icon: <PackageCheck size={14} /> },
    { label: 'Expires',   value: expiryDays ? expiry : '—', icon: <Clock size={14} /> },
    { label: 'Network',   value: 'Polygon Amoy',        icon: <Server size={14} /> },
  ];

  return (
    <SectionCard animDelay={animDelay} style={{ borderTop: '3px solid #00C896' }}>
      <CardHeading>NFT Preview</CardHeading>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '1.25rem',
      }}>
        {fields.map(f => (
          <div key={f.label} style={{
            padding: '1rem',
            background: '#f7fbf9',
            borderRadius: '10px',
            border: '1px solid #e0ede9',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              fontFamily: "'Courier New', monospace",
              fontSize: '0.65rem', color: '#00A87E',
              fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: '0.4rem',
            }}>
              {f.icon}{f.label}
            </div>
            <div style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: '0.9rem', fontWeight: 700,
              color: '#0d1f1a',
              wordBreak: 'break-all',
            }}>{f.value}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ── form inputs ─────────────────────────────────────────────── */
function FormCard({ formData, setFormData, animDelay }) {
  return (
    <SectionCard animDelay={animDelay}>
      <CardHeading>Batch Details</CardHeading>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{
          display: 'block',
          fontFamily: "'Courier New', monospace",
          fontSize: '0.7rem', fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: '#6B7280',
          marginBottom: '0.5rem',
        }}>Batch Identifier</label>
        <input
          type="text"
          value={formData.batchId}
          onChange={e => setFormData(d => ({ ...d, batchId: e.target.value }))}
          required
          style={{
            width: '100%',
            padding: '0.85rem 1rem',
            background: '#f7fbf9',
            border: '1.5px solid #e0ede9',
            borderRadius: '10px',
            color: '#0d1f1a',
            fontFamily: "'Courier New', monospace",
            fontSize: '0.92rem',
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocus={e => {
            e.target.style.borderColor = '#00C896';
            e.target.style.boxShadow   = '0 0 0 3px rgba(0,200,150,0.12)';
          }}
          onBlur={e => {
            e.target.style.borderColor = '#e0ede9';
            e.target.style.boxShadow   = 'none';
          }}
        />
        <p style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '0.78rem', color: '#9CA3AF',
          marginTop: '0.35rem',
        }}>A unique human-readable ID for physical labeling.</p>
      </div>

      <div>
        <label style={{
          display: 'block',
          fontFamily: "'Courier New', monospace",
          fontSize: '0.7rem', fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: '#6B7280',
          marginBottom: '0.5rem',
        }}>Days Until Expiry</label>
        <input
          type="number"
          value={formData.expiryDays}
          onChange={e => setFormData(d => ({ ...d, expiryDays: parseInt(e.target.value) || 0 }))}
          min="1"
          required
          style={{
            width: '100%',
            padding: '0.85rem 1rem',
            background: '#f7fbf9',
            border: '1.5px solid #e0ede9',
            borderRadius: '10px',
            color: '#0d1f1a',
            fontFamily: "'Courier New', monospace",
            fontSize: '0.92rem',
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocus={e => {
            e.target.style.borderColor = '#00C896';
            e.target.style.boxShadow   = '0 0 0 3px rgba(0,200,150,0.12)';
          }}
          onBlur={e => {
            e.target.style.borderColor = '#e0ede9';
            e.target.style.boxShadow   = 'none';
          }}
        />
      </div>
    </SectionCard>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function MintToken({ contract }) {
  const navigate  = useNavigate();
  const { ready, authenticated } = useAuth();
  const { wallets } = useWallets();
  const wallet    = wallets[0];
  const { mintBatch, loading, isGeneratingProof, error: gaslessError, consensusResult } = useGaslessContract();
  const [error,    setError]    = useState('');
  const [fpFile,   setFpFile]   = useState(null);
  const [formData, setFormData] = useState({
    batchId:    `BATCH-${Math.floor(Math.random() * 10000)}`,
    expiryDays: 365,
  });

  const handleMint = async (e) => {
    e.preventDefault();
    if (!authenticated) { setError('Please log in first.'); return; }
    try {
      setError('');
      const receipt = await mintBatch({
        batchId:         formData.batchId,
        daysUntilExpiry: Number(formData.expiryDays),
        hplcFile:        fpFile,   // null = demo fallback inside hook
      });
      console.log('✓ Minted!', receipt);
      navigate('/dashboard');
    } catch (err) {
      console.error('Mint failed:', err.message);
      setError(err.reason || err.message || 'Minting failed.');
    }
  };

  const isBusy = loading || isGeneratingProof;

  return (
    <>
      <DNABackground />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '3.5rem 48px 6rem',
        }} className="mint-wrap">

          {/* ── Page Header ── */}
          <div style={{ textAlign: 'center', marginBottom: '3rem' }} className="animate-fade-up">
            <div style={{
              fontFamily: "'Courier New', monospace",
              fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#00C896',
              marginBottom: '0.75rem',
            }}>MANUFACTURER VIEW</div>
            <h1 style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: 'clamp(2.2rem, 5vw, 3.25rem)',
              fontWeight: 700,
              color: '#0d1f1a',
              lineHeight: 1.1,
              marginBottom: '1rem',
            }}>Mint Reagent Batch</h1>
            <p style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '1.05rem',
              color: '#6B7280',
              lineHeight: 1.8,
              maxWidth: 520,
              margin: '0 auto',
            }}>
              Upload the HPLC fingerprint, fill in batch details, and commit an
              immutable NFT to Polygon. Requires{' '}
              <span style={{
                fontFamily: "'Courier New', monospace",
                fontSize: '0.82rem',
                background: '#f0faf6',
                border: '1px solid #c8ddd8',
                padding: '0.1rem 0.45rem',
                borderRadius: '4px',
                color: '#00A87E',
              }}>MANUFACTURER_ROLE</span>.
            </p>
          </div>

          {/* ── 2×2 Quadrant Grid ── */}
          <form onSubmit={handleMint}>
            <div className="mint-quadrant-grid" style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1.5rem',
              marginBottom: '1.75rem',
            }}>
              <ValidatorCard animDelay={0.08} consensusResult={consensusResult} />
              <UploadCard file={fpFile} onFile={setFpFile} animDelay={0.16} />
              <NFTPreviewCard batchId={formData.batchId} expiryDays={formData.expiryDays} animDelay={0.24} />
              <FormCard formData={formData} setFormData={setFormData} animDelay={0.32} />
            </div>

            {/* ── Error banners ── */}
            {(error || gaslessError) && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '1rem 1.25rem',
                background: 'rgba(255,77,77,0.06)',
                border: '1px solid rgba(255,77,77,0.2)',
                borderLeft: '3px solid #FF4D4D',
                borderRadius: '12px',
                fontFamily: "'Playfair Display', serif",
                fontSize: '0.9rem', color: '#991B1B',
                marginBottom: '1.5rem',
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                {error || gaslessError}
              </div>
            )}

            {/* ── Submit ── */}
            <button
              type="submit"
              disabled={isBusy || !authenticated}
              style={{
                width: '100%',
                padding: '1.1rem',
                borderRadius: '9999px',
                background: isBusy || !authenticated ? '#9CA3AF' : '#00C896',
                color: '#ffffff',
                fontFamily: "'Libre Baskerville', serif",
                fontSize: '1.05rem',
                fontWeight: 700,
                border: 'none',
                cursor: isBusy || !authenticated ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                boxShadow: isBusy || !authenticated ? 'none' : '0 8px 28px rgba(0,200,150,0.25)',
                transition: 'all 0.2s ease',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => {
                if (!isBusy && authenticated) {
                  e.currentTarget.style.background = '#00A87E';
                  e.currentTarget.style.transform  = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow  = '0 12px 36px rgba(0,200,150,0.30)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isBusy || !authenticated ? '#9CA3AF' : '#00C896';
                e.currentTarget.style.transform  = 'none';
                e.currentTarget.style.boxShadow  = isBusy || !authenticated ? 'none' : '0 8px 28px rgba(0,200,150,0.25)';
              }}
            >
              {isGeneratingProof ? (
                <>
                  <div style={{
                    width: 18, height: 18,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTop: '2px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Securing Batch Data…
                </>
              ) : loading ? (
                <>
                  <div style={{
                    width: 18, height: 18,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTop: '2px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Broadcasting Transaction…
                </>
              ) : (
                <>
                  <PackageCheck size={18} />
                  Commit to Polygon →
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .mint-wrap { padding: 2rem 1.25rem 4rem !important; }
          .mint-quadrant-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
