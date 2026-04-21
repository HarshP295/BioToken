// frontend/src/pages/LabDashboard.jsx
// ─────────────────────────────────────────────────────────────────
// Lab Verification Console — 4-step pipeline for reagent authentication
// Completely separate from the manufacturer Dashboard.
// ─────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, FlaskConical, Fingerprint, ShieldCheck,
  CheckCircle2, AlertTriangle, ShieldAlert, Info,
  ArrowRight, Beaker, Package, Truck, RefreshCw, Send, Upload,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLabVerification, LAB_STEPS } from '../hooks/useLabVerification';
import DNABackground from '../components/DNABackground';

/* ── Status metadata ──────────────────────────────────────────── */
const STATUS_META = [
  { label: 'MINTED',     color: '#4F46E5', icon: <Package size={14} /> },
  { label: 'IN TRANSIT', color: '#F59E0B', icon: <Truck size={14} /> },
  { label: 'RECEIVED',   color: '#6B7280', icon: <CheckCircle2 size={14} /> },
  { label: 'VERIFIED',   color: '#00C896', icon: <ShieldCheck size={14} /> },
  { label: 'CONSUMED',   color: '#FF4D4D', icon: <Beaker size={14} /> },
];

/* ── Pipeline step definitions ────────────────────────────────── */
const PIPELINE = [
  { id: 1, label: 'Fetch NFT',      desc: 'Read token data + vk from Polygon',     icon: <Search size={18} /> },
  { id: 2, label: 'AI Pre-Screen',   desc: 'Anomaly detection on HPLC peaks',       icon: <Fingerprint size={18} /> },
  { id: 3, label: 'ZK Proof',        desc: 'Client-side Groth16 proof generation',  icon: <ShieldCheck size={18} /> },
  { id: 4, label: 'On-Chain Verify', desc: 'Submit proof to smart contract',        icon: <Send size={18} /> },
];

/* ── Pipeline progress indicator ──────────────────────────────── */
function PipelineIndicator({ currentStep }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      marginBottom: '2rem', padding: '0 0.5rem',
    }}>
      {PIPELINE.map((s, i) => {
        const done   = currentStep > s.id;
        const active = currentStep === s.id;

        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center',
            flex: i < PIPELINE.length - 1 ? '1' : 'none',
          }}>
            {/* Step node */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: done ? '#00C896' : active ? 'rgba(0,200,150,0.12)' : '#F3F2EF',
                border: done ? 'none' : active ? '2px solid #00C896' : '2px solid #E5E3DF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: done ? '#fff' : active ? '#00A87E' : '#9CA3AF',
                transition: 'all 0.4s ease',
                boxShadow: active ? '0 0 0 6px rgba(0,200,150,0.12)' : 'none',
              }}>
                {done ? <CheckCircle2 size={22} /> : active ? (
                  <div style={{
                    width: 20, height: 20,
                    border: '2.5px solid #00C896',
                    borderTop: '2.5px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                ) : s.icon}
              </div>
              <div style={{
                fontFamily: "'Courier New', monospace",
                fontSize: '0.64rem', fontWeight: 700,
                marginTop: '0.5rem', textAlign: 'center',
                whiteSpace: 'nowrap', letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: done ? '#00A87E' : active ? '#0d1f1a' : '#9CA3AF',
              }}>{s.label}</div>
            </div>

            {/* Connector */}
            {i < PIPELINE.length - 1 && (
              <div style={{
                flex: 1, height: 2,
                background: done ? '#00C896' : '#E5E3DF',
                margin: '0 0.6rem', marginBottom: '1.3rem',
                transition: 'background 0.5s ease',
                borderRadius: 1,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Status timeline (horizontal) ─────────────────────────────── */
function StatusTimeline({ currentStatus }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.25rem',
      padding: '1rem 0',
    }}>
      {STATUS_META.map((s, i) => {
        const done    = currentStatus > i;
        const active  = currentStatus === i;
        return (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center',
            flex: i < STATUS_META.length - 1 ? 1 : 'none',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.7rem',
              borderRadius: '9999px',
              background: active ? `${s.color}14` : 'transparent',
              border: active ? `1.5px solid ${s.color}40` : '1.5px solid transparent',
              transition: 'all 0.3s',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: done || active ? s.color : '#E5E3DF',
                transition: 'background 0.3s',
              }} />
              <span style={{
                fontFamily: "'Courier New', monospace",
                fontSize: '0.62rem', fontWeight: 700,
                color: done || active ? s.color : '#9CA3AF',
                letterSpacing: '0.08em',
              }}>{s.label}</span>
            </div>
            {i < STATUS_META.length - 1 && (
              <div style={{
                flex: 1, height: 1.5,
                background: done ? s.color : '#E5E3DF',
                margin: '0 0.3rem',
                transition: 'background 0.4s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── AI Result card ───────────────────────────────────────────── */
function AiResultCard({ result }) {
  if (!result) return null;
  const ok = result.genuine;

  return (
    <div style={{
      padding: '1.25rem',
      borderRadius: '12px',
      background: ok ? 'rgba(0,200,150,0.05)' : 'rgba(255,77,77,0.05)',
      border: `1px solid ${ok ? 'rgba(0,200,150,0.2)' : 'rgba(255,77,77,0.2)'}`,
      borderLeft: `3px solid ${ok ? '#00C896' : '#FF4D4D'}`,
      marginBottom: '1.25rem',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        marginBottom: '0.65rem',
      }}>
        {ok ? <CheckCircle2 size={18} color="#00C896" /> : <AlertTriangle size={18} color="#FF4D4D" />}
        <span style={{
          fontFamily: "'Libre Baskerville', serif",
          fontWeight: 700, fontSize: '0.95rem',
          color: ok ? '#065F46' : '#991B1B',
        }}>
          {ok ? 'AI Pre-Screen: GENUINE ✓' : 'AI Pre-Screen: ANOMALY DETECTED ✗'}
        </span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.75rem',
      }}>
        {[
          { label: 'Anomaly Prob', value: `${(result.anomaly_prob * 100).toFixed(2)}%` },
          { label: 'RT Deviation', value: `${result.pct_deviation?.toFixed(2) ?? '—'}%` },
          { label: 'Prediction', value: result.result },
        ].map(m => (
          <div key={m.label} style={{
            padding: '0.6rem 0.8rem',
            background: 'rgba(255,255,255,0.7)',
            borderRadius: '8px',
            border: '1px solid rgba(0,0,0,0.06)',
          }}>
            <div style={{
              fontFamily: "'Courier New', monospace",
              fontSize: '0.6rem', fontWeight: 700,
              color: '#6B7280', textTransform: 'uppercase',
              letterSpacing: '0.1em', marginBottom: '0.2rem',
            }}>{m.label}</div>
            <div style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: '0.9rem', fontWeight: 700,
              color: '#0d1f1a',
            }}>{m.value}</div>
          </div>
        ))}
      </div>

      {ok && (
        <div style={{
          marginTop: '0.75rem',
          fontFamily: "'Playfair Display', serif",
          fontSize: '0.82rem', color: '#065F46',
        }}>
          Deviation within threshold — proceeding to ZK proof generation.
        </div>
      )}
      {!ok && (
        <div style={{
          marginTop: '0.75rem',
          fontFamily: "'Playfair Display', serif",
          fontSize: '0.82rem', color: '#991B1B',
        }}>
          ZK proof generation halted. Reagent failed authenticity check.
        </div>
      )}
    </div>
  );
}

/* ── Token Info Card ──────────────────────────────────────────── */
function TokenInfoCard({ token }) {
  if (!token) return null;
  const meta = STATUS_META[token.status] || STATUS_META[0];

  return (
    <div style={{
      background: '#fff', borderRadius: '16px',
      border: '1px solid #e0ede9', padding: '1.5rem',
      boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      marginBottom: '1.25rem',
      borderLeft: `3px solid ${meta.color}`,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: '1rem',
        flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.65rem', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#00C896', marginBottom: '0.3rem',
          }}>TOKEN #{token.id}</div>
          <div style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: '1.4rem', fontWeight: 700,
            color: '#0d1f1a',
          }}>{token.batchId}</div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.3rem 0.8rem', borderRadius: '9999px',
          fontFamily: "'Courier New', monospace",
          fontSize: '0.7rem', fontWeight: 700,
          background: `${meta.color}14`,
          color: meta.color,
          border: `1px solid ${meta.color}30`,
          letterSpacing: '0.06em',
        }}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* Status Timeline */}
      <StatusTimeline currentStatus={token.status} />

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '1rem', marginTop: '0.75rem',
      }}>
        <div>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.62rem', fontWeight: 700,
            color: '#6B7280', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.3rem',
          }}>Current Owner</div>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.78rem', color: '#4F46E5',
            wordBreak: 'break-all',
          }}>{token.owner}</div>
        </div>
        <div>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.62rem', fontWeight: 700,
            color: '#6B7280', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.3rem',
          }}>Expiry</div>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.78rem', color: '#0d1f1a',
          }}>{token.expiry}</div>
        </div>
      </div>

      {token.vkHash && token.vkHash !== '0x' + '0'.repeat(64) && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0ede9' }}>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.62rem', fontWeight: 700,
            color: '#6B7280', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.3rem',
          }}>Verification Key Commitment</div>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.72rem', color: '#6B7280',
            background: '#F3F2EF', padding: '0.6rem 0.8rem',
            borderRadius: '8px', border: '1px solid #E5E3DF',
            wordBreak: 'break-all', lineHeight: 1.5,
          }}>{token.vkHash}</div>
        </div>
      )}
    </div>
  );
}

/* ── Success result card ──────────────────────────────────────── */
function SuccessCard({ txReceipt, tokenId }) {
  return (
    <div style={{
      background: 'rgba(0,200,150,0.04)',
      border: '1px solid rgba(0,200,150,0.2)',
      borderLeft: '3px solid #00C896',
      borderRadius: '16px', padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#00C896', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.25rem',
        boxShadow: '0 0 0 8px rgba(0,200,150,0.15)',
      }}>
        <ShieldCheck size={30} color="#fff" />
      </div>
      <div style={{
        fontFamily: "'Libre Baskerville', serif",
        fontSize: '1.5rem', fontWeight: 700,
        color: '#065F46', marginBottom: '0.5rem',
      }}>Verification Complete ✓</div>
      <div style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '0.95rem', color: '#6B7280',
        marginBottom: '1.5rem',
      }}>
        Token #{tokenId} has been verified on-chain. NFT status updated to VERIFIED
        and ownership transferred to your lab wallet.
      </div>
      <Link to={`/details?id=${tokenId}`} style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.7rem 1.5rem', borderRadius: '9999px',
        background: '#00C896', color: '#fff',
        fontFamily: "'Playfair Display', serif",
        fontWeight: 600, fontSize: '0.88rem',
        textDecoration: 'none',
        boxShadow: '0 8px 24px rgba(0,200,150,0.2)',
        transition: 'all 0.2s ease',
      }}>
        View Token Details <ArrowRight size={15} />
      </Link>
    </div>
  );
}

/* ── Main Page Component ──────────────────────────────────────── */
export default function LabDashboard() {
  const { ready, authenticated } = useAuth();
  const {
    step, tokenData, aiResult, zkProof, txReceipt, error, loading,
    fetchToken, runAiCheck, generateProof, submitVerification, reset,
  } = useLabVerification();

  const [tokenIdInput,     setTokenIdInput]     = useState('');
  const [labFile,          setLabFile]          = useState(null);
  const [extractedPeaks,   setExtractedPeaks]   = useState(null);   // number[10] from API
  const [peaksConfirmed,   setPeaksConfirmed]   = useState('');      // editable display string
  const [computedThreshold,setComputedThreshold]= useState(null);   // number from API
  const [extracting,       setExtracting]       = useState(false);
  const [extractError,     setExtractError]     = useState(null);
  const [labDragging,      setLabDragging]      = useState(false);

  // ── CSV upload → /extract-peaks ────────────────────────────────
  const handleLabFile = async (file) => {
    if (!file) return;
    setLabFile(file);
    setExtractError(null);
    setExtractedPeaks(null);
    setPeaksConfirmed('');
    setComputedThreshold(null);
    setExtracting(true);
    try {
      const AI_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000';
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${AI_URL}/extract-peaks`, { method: 'POST', body: fd });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      setExtractedPeaks(data.peaks);          // number[10]
      setPeaksConfirmed(data.peaks.join(', '));
      setComputedThreshold(data.threshold);
    } catch (err) {
      setExtractError(`Extraction failed: ${err.message}`);
    } finally {
      setExtracting(false);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────
  const handleFetch = async (e) => {
    e.preventDefault();
    if (!tokenIdInput.trim()) return;
    await fetchToken(tokenIdInput.trim());
  };

  const handleAiCheck = async (e) => {
    e.preventDefault();
    const peaks = peaksConfirmed.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    if (peaks.length !== 10) {
      alert('Please upload a CSV to extract exactly 10 HPLC peak values.');
      return;
    }
    await runAiCheck(peaks);
  };

  const handleGenerateProof = async () => {
    const peaks = peaksConfirmed.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
    const threshold = computedThreshold ?? 50;
    const proofData = await generateProof(peaks, threshold);
    // Auto-submit after proof generation
    if (proofData && tokenData) {
      await submitVerification(tokenData.id, proofData.proof, proofData.publicSignals);
    }
  };

  const handleReset = () => {
    reset();
    setTokenIdInput('');
    setLabFile(null);
    setExtractedPeaks(null);
    setPeaksConfirmed('');
    setComputedThreshold(null);
    setExtracting(false);
    setExtractError(null);
    setLabDragging(false);
  };

  // ── Unauthenticated state ──────────────────────────────────────
  if (!authenticated) {
    return (
      <>
        <DNABackground />
        <div style={{
          position: 'relative', zIndex: 1,
          minHeight: '80vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '4rem 1.5rem',
        }}>
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            background: 'rgba(0,200,150,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 2rem', color: '#00C896',
            boxShadow: '0 0 0 16px rgba(0,200,150,0.04)',
            animation: 'pulseDot 2.2s ease-in-out infinite',
          }}>
            <FlaskConical size={40} />
          </div>
          <h1 style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: '2.6rem', fontWeight: 700,
            color: '#0d1f1a', marginBottom: '0.75rem',
          }}>Lab Verification Console</h1>
          <p style={{
            fontFamily: "'Playfair Display', serif",
            color: '#6B7280', fontSize: '1.05rem',
            maxWidth: 420, margin: '0 auto 2.5rem', lineHeight: 1.8,
          }}>
            Connect your wallet to verify reagent batches on-chain using zero-knowledge proofs.
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '1rem 1.75rem',
            border: '1.5px dashed #c8ddd8', borderRadius: '16px',
            color: '#6B7280',
            fontFamily: "'Courier New', monospace",
            fontSize: '0.82rem',
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(8px)',
          }}>
            <Info size={16} /> Wallet disconnected — use Connect Wallet above
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DNABackground />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          maxWidth: 800, margin: '0 auto',
          padding: '3rem 48px 5rem',
        }} className="lab-dashboard-wrap">

          {/* ── Page Header ── */}
          <div style={{ marginBottom: '2.5rem' }} className="animate-fade-up">
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem',
            }}>
              <div>
                <div style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: '0.7rem', fontWeight: 700,
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: '#00C896', marginBottom: '0.6rem',
                }}>LAB VIEW</div>
                <h1 style={{
                  fontFamily: "'Libre Baskerville', serif",
                  fontSize: 'clamp(2rem, 5vw, 3rem)',
                  fontWeight: 700, color: '#0d1f1a',
                  lineHeight: 1.1, marginBottom: '0.5rem',
                }}>Verification Console</h1>
                <p style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '1rem', color: '#6B7280', lineHeight: 1.7,
                }}>
                  Authenticate reagent batches with AI pre-screening and zero-knowledge proof verification.
                </p>
              </div>
              {step > LAB_STEPS.IDLE && (
                <button
                  onClick={handleReset}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 1.25rem', borderRadius: '9999px',
                    background: 'transparent', border: '1.5px solid #0d1f1a',
                    color: '#0d1f1a',
                    fontFamily: "'Playfair Display', serif",
                    fontWeight: 600, fontSize: '0.82rem',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <RefreshCw size={14} /> New Scan
                </button>
              )}
            </div>
          </div>

          {/* ── Pipeline Indicator ── */}
          {step > LAB_STEPS.IDLE && step < LAB_STEPS.DONE && (
            <PipelineIndicator currentStep={step} />
          )}

          {/* ── Error Banner ── */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
              padding: '1rem 1.25rem',
              background: 'rgba(255,77,77,0.06)',
              border: '1px solid rgba(255,77,77,0.2)',
              borderLeft: '3px solid #FF4D4D',
              borderRadius: '12px',
              fontFamily: "'Courier New', monospace",
              fontSize: '0.85rem', color: '#991B1B',
              marginBottom: '1.25rem',
            }}>
              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>Pipeline Error</div>
                {error}
              </div>
            </div>
          )}

          {/* ── Token Info ── */}
          <TokenInfoCard token={tokenData} />

          {/* ── AI Result ── */}
          <AiResultCard result={aiResult} />

          {/* ── Success ── */}
          {step === LAB_STEPS.DONE && txReceipt && (
            <SuccessCard txReceipt={txReceipt} tokenId={tokenData?.id} />
          )}

          {/* ── Step 1: Fetch Token ── */}
          {step <= LAB_STEPS.FETCHING && !tokenData && (
            <div style={{
              background: '#fff', borderRadius: '16px',
              border: '1px solid #e0ede9', padding: '2rem',
              boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
              marginBottom: '1.25rem',
            }} className="animate-fade-up">
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                marginBottom: '1.5rem',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '12px',
                  background: 'rgba(0,200,150,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#00A87E',
                }}>
                  <Search size={20} />
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Libre Baskerville', serif",
                    fontWeight: 700, fontSize: '1.05rem',
                    color: '#0d1f1a',
                  }}>Lookup Batch</div>
                  <div style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: '0.7rem', color: '#6B7280',
                  }}>Enter Token ID to fetch NFT data from Polygon</div>
                </div>
              </div>

              <form onSubmit={handleFetch}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{
                    display: 'block',
                    fontFamily: "'Courier New', monospace",
                    fontSize: '0.68rem', fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: '#6B7280', marginBottom: '0.5rem',
                  }}>Token ID</label>
                  <input
                    type="number"
                    value={tokenIdInput}
                    onChange={e => setTokenIdInput(e.target.value)}
                    required
                    disabled={loading}
                    placeholder="e.g. 0"
                    style={{
                      width: '100%', padding: '0.85rem 1rem',
                      background: '#f7fbf9', border: '1.5px solid #e0ede9',
                      borderRadius: '10px', color: '#0d1f1a',
                      fontFamily: "'Courier New', monospace",
                      fontSize: '0.92rem', outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = '#00C896';
                      e.target.style.boxShadow = '0 0 0 3px rgba(0,200,150,0.12)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#e0ede9';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !tokenIdInput.trim()}
                  style={{
                    width: '100%', padding: '0.9rem',
                    borderRadius: '9999px',
                    background: loading ? '#9CA3AF' : '#00C896',
                    color: '#fff', border: 'none',
                    fontFamily: "'Libre Baskerville', serif",
                    fontSize: '0.95rem', fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '0.5rem',
                    boxShadow: loading ? 'none' : '0 8px 24px rgba(0,200,150,0.2)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {loading ? (
                    <>
                      <div style={{
                        width: 16, height: 16,
                        border: '2px solid rgba(255,255,255,0.4)',
                        borderTop: '2px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      Fetching from Polygon…
                    </>
                  ) : (
                    <>
                      <Search size={16} /> Fetch NFT Data
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ── Step 2: CSV Upload + AI Pre-Screen ── */}
          {tokenData && step >= LAB_STEPS.AI_CHECK && step < LAB_STEPS.ZK_PROVING && !aiResult && (
            <div style={{
              background: '#fff', borderRadius: '16px',
              border: '1px solid #e0ede9', padding: '2rem',
              boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
              marginBottom: '1.25rem',
            }} className="animate-fade-up">

              {/* Card header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                marginBottom: '1.5rem',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '12px',
                  background: 'rgba(0,200,150,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#00A87E',
                }}>
                  <Fingerprint size={20} />
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Libre Baskerville', serif",
                    fontWeight: 700, fontSize: '1.05rem',
                    color: '#0d1f1a',
                  }}>Lab Scan Data</div>
                  <div style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: '0.7rem', color: '#6B7280',
                  }}>Upload HPLC chromatogram CSV to extract peak profile</div>
                </div>
              </div>

              {/* ── CSV Drop Zone ── */}
              <div
                id="lab-csv-dropzone"
                onDragOver={e => { e.preventDefault(); setLabDragging(true); }}
                onDragLeave={() => setLabDragging(false)}
                onDrop={e => {
                  e.preventDefault(); setLabDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleLabFile(f);
                }}
                onClick={() => document.getElementById('lab-file-input').click()}
                style={{
                  border: `2px dashed ${labDragging ? '#00C896' : '#b8d8cf'}`,
                  borderRadius: '12px',
                  padding: '2.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: labDragging ? 'rgba(0,200,150,0.06)' : '#f7fbf9',
                  transition: 'all 0.2s ease',
                  marginBottom: '1.25rem',
                }}
              >
                <input
                  id="lab-file-input"
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) handleLabFile(e.target.files[0]); }}
                />

                {extracting ? (
                  <>
                    <div style={{
                      width: 36, height: 36,
                      border: '3px solid rgba(0,200,150,0.3)',
                      borderTop: '3px solid #00C896',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                      margin: '0 auto 0.75rem',
                    }} />
                    <div style={{
                      fontFamily: "'Libre Baskerville', serif",
                      fontWeight: 700, fontSize: '0.95rem',
                      color: '#0d1f1a', marginBottom: '0.25rem',
                    }}>Extracting peaks…</div>
                    <div style={{
                      fontFamily: "'Courier New', monospace",
                      fontSize: '0.72rem', color: '#6B7280',
                    }}>{labFile?.name}</div>
                  </>
                ) : labFile && extractedPeaks ? (
                  <>
                    <CheckCircle2 size={36} style={{ color: '#00C896', margin: '0 auto 0.75rem', display: 'block' }} />
                    <div style={{
                      fontFamily: "'Libre Baskerville', serif",
                      fontWeight: 700, fontSize: '1rem',
                      color: '#0d1f1a', marginBottom: '0.3rem',
                    }}>{labFile.name}</div>
                    <div style={{
                      fontFamily: "'Courier New', monospace",
                      fontSize: '0.72rem', color: '#6B7280',
                    }}>{(labFile.size / 1024).toFixed(1)} KB · Click to replace</div>
                  </>
                ) : (
                  <>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      background: 'rgba(0,200,150,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 1rem', color: '#00C896',
                    }}>
                      <Upload size={24} />
                    </div>
                    <div style={{
                      fontFamily: "'Libre Baskerville', serif",
                      fontWeight: 700, fontSize: '1rem',
                      color: '#0d1f1a', marginBottom: '0.4rem',
                    }}>Drop HPLC chromatogram here</div>
                    <div style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: '0.85rem', color: '#6B7280',
                    }}>or click to browse · CSV only</div>
                  </>
                )}
              </div>

              {/* ── Extraction error ── */}
              {extractError && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(255,77,77,0.05)',
                  border: '1px solid rgba(255,77,77,0.2)',
                  borderLeft: '3px solid #FF4D4D',
                  borderRadius: '10px',
                  marginBottom: '1.25rem',
                  fontFamily: "'Courier New', monospace",
                  fontSize: '0.82rem', color: '#991B1B',
                }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  {extractError}
                </div>
              )}

              {/* ── Extracted peak preview + threshold ── */}
              {extractedPeaks && (
                <form onSubmit={handleAiCheck}>
                  {/* Per-peak chip grid */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{
                      display: 'block',
                      fontFamily: "'Courier New', monospace",
                      fontSize: '0.68rem', fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: '#6B7280', marginBottom: '0.6rem',
                    }}>Extracted Peak Profile — 10 Values</label>

                    {/* Visual chip row */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: '0.5rem', marginBottom: '0.75rem',
                    }}>
                      {extractedPeaks.map((v, i) => (
                        <div key={i} style={{
                          textAlign: 'center',
                          padding: '0.55rem 0.3rem',
                          borderRadius: '8px',
                          background: 'rgba(0,200,150,0.06)',
                          border: '1px solid rgba(0,200,150,0.18)',
                        }}>
                          <div style={{
                            fontFamily: "'Courier New', monospace",
                            fontSize: '0.55rem', color: '#9CA3AF',
                            letterSpacing: '0.08em', marginBottom: '0.15rem',
                          }}>P{i + 1}</div>
                          <div style={{
                            fontFamily: "'Courier New', monospace",
                            fontSize: '0.85rem', fontWeight: 700,
                            color: '#065F46',
                          }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Editable confirmation field */}
                    <input
                      type="text"
                      value={peaksConfirmed}
                      onChange={e => setPeaksConfirmed(e.target.value)}
                      required
                      disabled={loading}
                      style={{
                        width: '100%', padding: '0.75rem 1rem',
                        background: '#f7fbf9', border: '1.5px solid #e0ede9',
                        borderRadius: '10px', color: '#0d1f1a',
                        fontFamily: "'Courier New', monospace",
                        fontSize: '0.85rem', outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = '#00C896';
                        e.target.style.boxShadow = '0 0 0 3px rgba(0,200,150,0.12)';
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = '#e0ede9';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                    <p style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.3rem',
                    }}>Auto-populated from CSV · Edit if needed before submitting.</p>
                  </div>

                  {/* Dynamic threshold display */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: '#f7fbf9',
                    border: '1.5px solid #e0ede9',
                    borderRadius: '10px',
                    marginBottom: '1.25rem',
                  }}>
                    <div>
                      <div style={{
                        fontFamily: "'Courier New', monospace",
                        fontSize: '0.62rem', fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: '#6B7280', marginBottom: '0.2rem',
                      }}>Tolerance Threshold (σ) — Auto-computed</div>
                      <div style={{
                        fontFamily: "'Courier New', monospace",
                        fontSize: '0.72rem', color: '#9CA3AF',
                      }}>max adjacent Δ + 5, min 50 — matches manufacturer circuit</div>
                    </div>
                    <div style={{
                      fontFamily: "'Courier New', monospace",
                      fontSize: '1.4rem', fontWeight: 700,
                      color: '#00A87E',
                      paddingLeft: '1rem',
                      flexShrink: 0,
                    }}>{computedThreshold}</div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !extractedPeaks}
                    style={{
                      width: '100%', padding: '0.9rem',
                      borderRadius: '9999px',
                      background: (loading || !extractedPeaks) ? '#9CA3AF' : '#00C896',
                      color: '#fff', border: 'none',
                      fontFamily: "'Libre Baskerville', serif",
                      fontSize: '0.95rem', fontWeight: 700,
                      cursor: (loading || !extractedPeaks) ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '0.5rem',
                      boxShadow: (loading || !extractedPeaks) ? 'none' : '0 8px 24px rgba(0,200,150,0.2)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {loading ? (
                      <>
                        <div style={{
                          width: 16, height: 16,
                          border: '2px solid rgba(255,255,255,0.4)',
                          borderTop: '2px solid #fff',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                        Running AI Analysis…
                      </>
                    ) : (
                      <>
                        <Fingerprint size={16} /> Run AI Pre-Screen
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Prompt to upload if no file yet */}
              {!extractedPeaks && !extracting && (
                <p style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '0.82rem', color: '#9CA3AF',
                  textAlign: 'center', marginTop: '0.5rem',
                }}>Upload a CSV above to auto-extract peak profile · CSV only</p>
              )}
            </div>
          )}

          {/* ── Step 3+4: Auto ZK Proof + Submit ── */}
          {aiResult?.genuine && step >= LAB_STEPS.ZK_PROVING && step < LAB_STEPS.DONE && (
            <div style={{
              background: '#fff', borderRadius: '16px',
              border: '1px solid #e0ede9', padding: '2rem',
              boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
              marginBottom: '1.25rem',
            }} className="animate-fade-up">
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                marginBottom: '1.5rem',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '12px',
                  background: 'rgba(0,200,150,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#00A87E',
                }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Libre Baskerville', serif",
                    fontWeight: 700, fontSize: '1.05rem',
                    color: '#0d1f1a',
                  }}>Zero-Knowledge Verification</div>
                  <div style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: '0.7rem', color: '#6B7280',
                  }}>Generate Groth16 proof and submit to Polygon</div>
                </div>
              </div>

              {/* Status details */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '0.6rem',
                marginBottom: '1.5rem',
              }}>
                {[
                  { label: 'ZK Proof Generation', done: step > LAB_STEPS.ZK_PROVING, active: step === LAB_STEPS.ZK_PROVING },
                  { label: 'On-Chain Submission',  done: step > LAB_STEPS.SUBMITTING, active: step === LAB_STEPS.SUBMITTING },
                ].map(s => (
                  <div key={s.label} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.8rem 1rem', borderRadius: '10px',
                    background: s.active ? 'rgba(0,200,150,0.05)' : 'transparent',
                    border: s.active ? '1px solid rgba(0,200,150,0.15)' : '1px solid #e0ede9',
                    opacity: s.done || s.active ? 1 : 0.4,
                    transition: 'all 0.3s',
                  }}>
                    <div style={{
                      color: s.done ? '#00C896' : s.active ? '#00A87E' : '#9CA3AF',
                      flexShrink: 0,
                    }}>
                      {s.done ? <CheckCircle2 size={18} /> : s.active ? (
                        <div style={{
                          width: 18, height: 18,
                          border: '2.5px solid #00C896',
                          borderTop: '2.5px solid transparent',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                      ) : <ShieldCheck size={18} />}
                    </div>
                    <div style={{
                      fontFamily: "'Courier New', monospace",
                      fontWeight: 600, fontSize: '0.85rem',
                      color: '#0d1f1a',
                    }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {!loading && step === LAB_STEPS.ZK_PROVING && (
                <button
                  onClick={handleGenerateProof}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '0.9rem',
                    borderRadius: '9999px',
                    background: '#00C896', color: '#fff',
                    border: 'none',
                    fontFamily: "'Libre Baskerville', serif",
                    fontSize: '0.95rem', fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '0.5rem',
                    boxShadow: '0 8px 24px rgba(0,200,150,0.2)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <ShieldCheck size={16} /> Generate Proof & Verify On-Chain
                </button>
              )}

              {loading && (
                <div style={{
                  textAlign: 'center', padding: '1rem 0',
                  fontFamily: "'Courier New', monospace",
                  fontSize: '0.82rem', color: '#6B7280',
                }}>
                  {step === LAB_STEPS.ZK_PROVING
                    ? 'Generating Groth16 proof in browser… This may take 10-30 seconds.'
                    : 'Broadcasting gasless transaction to Polygon…'}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .lab-dashboard-wrap { padding: 2rem 1.25rem 4rem !important; }
        }
      `}</style>
    </>
  );
}
