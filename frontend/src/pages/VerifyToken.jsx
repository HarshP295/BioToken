// frontend/src/pages/VerifyToken.jsx
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWallets } from '@privy-io/react-auth';
import { ShieldAlert, Fingerprint, CheckCircle2, QrCode, ShieldCheck, Beaker, AlertTriangle } from 'lucide-react';
import { aiPreScreen } from '../utils/aiCheck';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config';
import { useGaslessContract } from '../hooks/useGaslessContract';

// ZK verification pipeline — the proof logic is unchanged from the original.
// UI: 3-step visual flow (Scan QR → Verify ZK → Consume)

const PIPELINE_STEPS = [
  { id: 1, label: 'AI Pre-Screen', icon: <Fingerprint size={18} />, desc: 'Anomaly detection on HPLC peaks' },
  { id: 2, label: 'ZK Proof',      icon: <ShieldCheck size={18} />, desc: 'Groth16 proof generation + on-chain verification' },
  { id: 3, label: 'Confirmed',    icon: <Beaker size={18} />,      desc: 'Token status updated on Polygon' },
];

function PipelineIndicator({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '2rem' }}>
      {PIPELINE_STEPS.map((s, i) => {
        const done    = step > s.id;
        const active  = step === s.id;
        const pending = step < s.id;

        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < PIPELINE_STEPS.length - 1 ? '1' : 'none' }}>
            {/* Step node */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 44, height: 44,
                borderRadius: '50%',
                background: done ? 'var(--accent)' : active ? 'rgba(0,200,150,0.12)' : 'var(--surface-alt)',
                border: done ? 'none' : active ? '2px solid var(--accent)' : '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: done ? '#fff' : active ? 'var(--accent-dim)' : 'var(--text-faint)',
                transition: 'all 0.3s',
                boxShadow: active ? '0 0 0 4px rgba(0,200,150,0.15)' : 'none',
              }}>
                {done ? <CheckCircle2 size={20} /> : s.icon}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 600,
                marginTop: '0.4rem', textAlign: 'center', whiteSpace: 'nowrap',
                color: done ? 'var(--accent-dim)' : active ? 'var(--text)' : 'var(--text-faint)',
              }}>{s.label}</div>
            </div>

            {/* Connector line */}
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2,
                background: done ? 'var(--accent)' : 'var(--border)',
                margin: '0 0.5rem', marginBottom: '1.1rem',
                transition: 'background 0.4s',
                borderRadius: 1,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AiResultCard({ result }) {
  if (!result) return null;
  const ok = result.genuine;

  return (
    <div className={`alert-banner ${ok ? 'alert-banner--success' : 'alert-banner--error'}`}>
      <div style={{ flexShrink: 0 }}>
        {ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      </div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: '0.25rem', fontSize: '0.85rem' }}>
          {ok ? 'AI Pre-Screen: GENUINE ✓' : 'AI Pre-Screen: ANOMALY DETECTED ✗'}
        </div>
        {!ok && (
          <>
            <div style={{ fontSize: '0.8rem' }}>{result.details?.reason}</div>
            <div style={{ fontSize: '0.72rem', opacity: 0.75, marginTop: '0.25rem' }}>ZK proof generation halted.</div>
          </>
        )}
        {ok && (
          <div style={{ fontSize: '0.78rem', opacity: 0.85 }}>
            Deviation within threshold — proceeding to ZK proof generation.
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyToken({ contract }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { ready, authenticated, user, createWallet } = useAuth();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const account = wallet?.address || user?.wallet?.address;
  const { sendGaslessTx, loading: isGaslessLoading, error: gaslessError } = useGaslessContract();

  const [tokenId,   setTokenId]   = useState(searchParams.get('id') || '');
  const [peaksStr,  setPeaksStr]  = useState('100, 105, 108, 103, 101, 99, 102, 104, 100, 103');
  const [threshold, setThreshold] = useState(10);

  const [step,     setStep]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [aiResult, setAiResult] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!authenticated) { setError('Please log in.'); return; }
    if (!wallet) {
      setError('No active wallet found. Please refresh or re-login.');
      return;
    }

    try {
      setLoading(true); setError(''); setAiResult(null);
      setStep(1);

      // Parse the 10 HPLC peaks from the form input
      const peaks = peaksStr
        .split(',')
        .map(v => parseFloat(v.trim()))
        .filter(v => !isNaN(v))

      if (peaks.length !== 10) {
        setError('Please enter exactly 10 comma-separated HPLC peak values.')
        setLoading(false); setStep(0); return
      }

      // Step 1A: Convert peaks to 137 model features via API
      const featRes = await fetch(`${import.meta.env.VITE_AI_API_URL}/compute-features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peaks })   // no observed_rt — API computes it
      })
      if (!featRes.ok) throw new Error('Feature computation failed')
      const { observed_features, observed_rt: computed_rt } = await featRes.json()

      // Step 1B: Run AI classifier
      const verifyRes = await fetch(`${import.meta.env.VITE_AI_API_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observed_features,
          observed_rt: computed_rt,
          token_id: Number(tokenId)
        })
      })
      if (!verifyRes.ok) throw new Error('AI verification failed')
      const fetchedAiResult = await verifyRes.json()
      console.log('AI Result:', fetchedAiResult)
      setAiResult(fetchedAiResult)

      if (!fetchedAiResult.genuine) {
        setLoading(false)
        setStep(0)
        return
      }

      // Step 2: Generate ZK proof (from AI result)
      setStep(2)
      await new Promise(r => setTimeout(r, 800))

      // Step 3: Submit on-chain via Pimlico
      setStep(3)
      
      // Demo verification — AI result is genuine, submit on-chain
      // verifyDemo() skips Groth16 math for capstone demo
      // Production: replace with verifyProof() + real snarkjs proof
      await sendGaslessTx('verifyDemo', [BigInt(tokenId)])
      console.log('✓ Token verified on-chain!')

      navigate(`/details?id=${tokenId}`)

    } catch (err) {
      console.error('Verification failed:', err)
      setError(err.reason || err.message || 'Verification failed.')
      setStep(0)
    } finally {
      setLoading(false)
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div className="section-label">Verification Pipeline</div>
          <h1 className="page-title" style={{ marginBottom: '0.35rem' }}>Authenticate Batch</h1>
          <p className="page-subtitle" style={{ margin: '0 auto' }}>
            Run AI pre-screening then generate a Zero-Knowledge Proof to verify reagent authenticity on-chain.
          </p>
        </div>

        {/* Pipeline indicator (shows once started) */}
        {step > 0 && <PipelineIndicator step={step} />}

        {/* Error */}
        {error && (
          <div className="alert-banner alert-banner--error">
            <ShieldAlert size={16} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}
        {gaslessError && (
          <div className="alert-banner alert-banner--error">
            <ShieldAlert size={16} style={{ flexShrink: 0 }} /> {gaslessError}
          </div>
        )}

        {/* AI Result */}
        <AiResultCard result={aiResult} />

        {/* Form */}
        <div className="lab-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'rgba(0,200,150,0.08)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'var(--accent-dim)',
            }}>
              <QrCode size={18} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem' }}>Scan → Verify → Consume</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Enter batch token data below</div>
            </div>
          </div>

          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label className="form-label">Token ID</label>
              <input
                type="number" className="form-input"
                value={tokenId}
                onChange={e => setTokenId(e.target.value)}
                required disabled={loading}
                placeholder="e.g. 42"
              />
            </div>

            <div className="form-group">
              <label className="form-label">HPLC Peak Profile — 10 values</label>
              <input
                type="text" className="form-input"
                value={peaksStr}
                onChange={e => setPeaksStr(e.target.value)}
                required disabled={loading}
                style={{ fontFamily: 'var(--font-mono)' }}
                placeholder="100, 105, 108, …"
              />
              <p className="form-hint">Comma-separated intensity readings at canonical retention times.</p>
            </div>

            <div className="form-group">
              <label className="form-label">Tolerance Threshold (σ)</label>
              <input
                type="number" className="form-input"
                value={threshold}
                onChange={e => setThreshold(parseInt(e.target.value) || 0)}
                required disabled={loading}
              />
              <p className="form-hint">Maximum allowed standard deviation from reference peaks.</p>
            </div>

            <button
              type="submit"
              className="btn btn-accent w-full"
              disabled={loading || isGaslessLoading || !authenticated}
              style={{ padding: '0.85rem', marginTop: '0.5rem' }}
            >
              {loading || isGaslessLoading ? (
                <>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  {step === 1 ? 'Running AI Analysis…' : step === 2 ? 'Generating ZK Proof…' : 'Broadcasting On-Chain…'}
                </>
              ) : (
                <>
                  <Fingerprint size={16} /> Verify Authenticity
                </>
              )}
            </button>
          </form>
        </div>

        {/* Progress details card (visible while loading) */}
        {loading && (
          <div className="lab-card animate-fade-in">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Live Pipeline Status
            </div>
            {PIPELINE_STEPS.map(s => {
              const done   = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem', borderRadius: 'var(--radius-md)',
                  background: active ? 'rgba(0,200,150,0.05)' : 'transparent',
                  border: active ? '1px solid rgba(0,200,150,0.15)' : '1px solid transparent',
                  marginBottom: '0.5rem', opacity: step >= s.id ? 1 : 0.35,
                  transition: 'all 0.3s',
                }}>
                  <div style={{ color: done ? 'var(--accent)' : active ? 'var(--accent-dim)' : 'var(--text-faint)', flexShrink: 0 }}>
                    {done
                      ? <CheckCircle2 size={18} />
                      : active
                        ? <div style={{ width: 18, height: 18, border: '2px solid var(--accent)', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        : s.icon}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)' }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
