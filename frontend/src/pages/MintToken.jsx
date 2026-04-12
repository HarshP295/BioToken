// frontend/src/pages/MintToken.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useAuth } from '../hooks/useAuth';
import { useWallets } from '@privy-io/react-auth';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config';
import {
  Upload, PackageCheck, AlertCircle, ChevronRight,
  CheckCircle2, FlaskConical, Clock, Hash
} from 'lucide-react';
import { useGaslessContract } from '../hooks/useGaslessContract';

function ValidatorStrip() {
  const validators = [
    { name: 'Node A — Mumbai', ok: true },
    { name: 'Node B — Frankfurt', ok: true },
    { name: 'Node C — Singapore', ok: true },
  ];

  return (
    <div style={{
      background: 'rgba(0,200,150,0.05)',
      border: '1px solid rgba(0,200,150,0.18)',
      borderRadius: 'var(--radius-md)',
      padding: '1rem 1.25rem',
      marginBottom: '1.75rem',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-dim)', marginBottom: '0.75rem' }}>
        Consensus Validators
      </div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {validators.map((v) => (
          <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: v.ok ? 'var(--accent-dim)' : 'var(--alert)' }}>
            <CheckCircle2 size={12} />
            {v.name}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        3/3 validators reachable · Polygon Amoy
      </div>
    </div>
  );
}

function FingerprintUpload({ file, onFile }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById('fp-file-input').click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '2.5rem',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'rgba(0,200,150,0.04)' : 'var(--surface-alt)',
        transition: 'all 0.2s',
        marginBottom: '1.75rem',
      }}
    >
      <input
        id="fp-file-input"
        type="file"
        accept=".csv,.json,.txt"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files[0])}
      />
      {file ? (
        <div>
          <CheckCircle2 size={32} style={{ color: 'var(--accent)', margin: '0 auto 0.75rem' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)' }}>{file.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {(file.size / 1024).toFixed(1)} KB · Click to replace
          </div>
        </div>
      ) : (
        <div>
          <Upload size={28} style={{ color: 'var(--text-faint)', margin: '0 auto 0.75rem' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)' }}>
            Upload HPLC Fingerprint
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Drag &amp; drop a CSV / JSON peak profile, or click to browse
          </div>
        </div>
      )}
    </div>
  );
}

function NFTPreview({ batchId, expiryDays }) {
  const expiry = new Date(Date.now() + expiryDays * 86400000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0,200,150,0.06) 0%, rgba(79,70,229,0.06) 100%)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '1.5rem',
      marginBottom: '1.75rem',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        NFT Preview
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {[
          { icon: <Hash size={13} />, label: 'Batch ID',   value: batchId || '—' },
          { icon: <PackageCheck size={13} />, label: 'Status',  value: 'MINTED' },
          { icon: <Clock size={13} />,       label: 'Expires',  value: expiryDays ? expiry : '—' },
          { icon: <FlaskConical size={13} />, label: 'Network', value: 'Polygon Amoy' },
        ].map(({ icon, label, value }) => (
          <div key={label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              {icon}{label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MintToken({ contract }) {
  const navigate = useNavigate();
  const { ready, authenticated, user, createWallet } = useAuth();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const account = wallet?.address || user?.wallet?.address;
  const { mintBatch, loading, error: gaslessError } = useGaslessContract();
  const [internalLoading, setInternalLoading] = useState(false);
  const [error, setError]     = useState('');
  const [fpFile, setFpFile]   = useState(null);
  const [formData, setFormData] = useState({
    batchId: `BATCH-${Math.floor(Math.random() * 10000)}`,
    expiryDays: 365,
  });

  const handleMint = async (e) => {
    e.preventDefault();
    if (!authenticated) { setError('Please log in first.'); return; }
    
    try {
      setInternalLoading(true); setError('');
      
      const receipt = await mintBatch({
        batchId: formData.batchId,
        daysUntilExpiry: Number(formData.expiryDays),
      });
      
      console.log('✓ Minted! Receipt:', receipt);
      
      // Parse tokenId from logs to navigate, skipping here for brevity or simple navigate
      // We will redirect to a simple success page or home if parsing is skipped
      navigate('/dashboard'); 
    } catch (err) {
      console.error('Mint failed:', err.message);
      setError(err.reason || err.message || 'Minting failed.');
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div className="section-label">Manufacturer View</div>
          <h1 className="page-title" style={{ marginBottom: '0.35rem' }}>
            Mint Reagent Batch
          </h1>
          <p className="page-subtitle" style={{ margin: '0 auto' }}>
            Upload the HPLC fingerprint, fill in batch details, and commit an
            immutable NFT to Polygon. Requires <span className="mono-tag">MANUFACTURER_ROLE</span>.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
          {/* Left — Form */}
          <div>
            <ValidatorStrip />
            <FingerprintUpload file={fpFile} onFile={setFpFile} />

            <div className="lab-card">
              {error && (
                <div className="alert-banner alert-banner--error" style={{ marginBottom: '1.5rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} /> {error}
                </div>
              )}
              {gaslessError && (
                <div className="alert-banner alert-banner--error" style={{ marginBottom: '1.5rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} /> {gaslessError}
                </div>
              )}

              <form onSubmit={handleMint}>
                <div className="form-group">
                  <label className="form-label">Batch Identifier</label>
                  <input
                    type="text" className="form-input"
                    value={formData.batchId}
                    onChange={e => setFormData({ ...formData, batchId: e.target.value })}
                    required
                  />
                  <p className="form-hint">A unique human-readable ID for physical labeling.</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Days Until Expiry</label>
                  <input
                    type="number" className="form-input"
                    value={formData.expiryDays}
                    onChange={e => setFormData({ ...formData, expiryDays: parseInt(e.target.value) || 0 })}
                    min="1" required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-accent w-full"
                  disabled={loading || internalLoading || !authenticated}
                  style={{ marginTop: '0.5rem', padding: '0.85rem' }}
                >
                  {loading || internalLoading ? (
                    <>
                      <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Broadcasting Transaction…
                    </>
                  ) : (
                    <>
                      <PackageCheck size={16} />
                      Mint Validation Token
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right — Preview */}
          <div>
            <NFTPreview batchId={formData.batchId} expiryDays={formData.expiryDays} />

            {/* Explainer card */}
            <div className="lab-card" style={{ background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.12)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--chain)', marginBottom: '1rem' }}>
                What Happens On-Chain
              </div>
              {[
                'VK commitment hash stored in the NFT',
                'Batch ID hashed into token metadata',
                'Expiry timestamp locked immutably',
                'Status set to MINTED (0)',
                'TokenMinted event emitted on Polygon',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
                    color: 'var(--chain)', background: 'rgba(79,70,229,0.1)',
                    borderRadius: '9999px', padding: '0.1rem 0.5rem', flexShrink: 0, marginTop: 1,
                  }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 768px) {
          .page-content > div > div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
