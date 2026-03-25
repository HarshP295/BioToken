// frontend/src/pages/VerifyToken.jsx
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldAlert, Fingerprint, CheckCircle2 } from 'lucide-react';
import { aiPreScreen } from '../utils/aiCheck';

// In a real browser app, we would load the WASM and ZKEY using snarkjs in the browser.
// For this demo, we'll simulate the local proof generation step, since compiling
// snarkjs for Vite requires complex Webpack/Rollup polyfills for crypto/fs/path.
// The actual ZK math and AI logic work end-to-end in our integrate.js script.

export default function VerifyToken({ contract, account }) {
  const [searchParams] = useSearchParams();
  const rawId = searchParams.get('id');
  const navigate = useNavigate();
  
  const [tokenId, setTokenId] = useState(rawId || '');
  const [peaksStr, setPeaksStr] = useState("100, 105, 108, 103, 101, 99, 102, 104, 100, 103");
  const [threshold, setThreshold] = useState(10);
  
  const [step, setStep] = useState(0); // 0: input, 1: AI, 2: ZK, 3: On-chain
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiResult, setAiResult] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!contract || !account) {
      setError('Please connect your wallet.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setStep(1); // AI step
      
      const peaks = peaksStr.split(',').map(s => parseInt(s.trim()));
      
      // 1. AI PRE-SCREEN
      await new Promise(r => setTimeout(r, 800)); // simulate computation
      const aiRes = aiPreScreen(peaks, threshold);
      setAiResult(aiRes);
      
      if (!aiRes.genuine) {
        setLoading(false);
        return; // Halt pipeline
      }

      // 2. ZK PROOF GENERATION (Simulated for frontend)
      setStep(2);
      await new Promise(r => setTimeout(r, 1500)); // simulate snarkjs prove
      
      // Use the pre-computed valid proof from our backend
      const proof = {
         a: ["0x1818d6a8b111aadb92e4ab61bdfca29cbed148d4fb985fedef9788f8d68d1840", "0x2db42bdfb325df2008ad761be5def24f5dcb9beee1bdf5cdb80ab1e7cf452ec8"],
         b: [["0x1eadd8dd99f81f181eb9b42df35c24e7732aaea09405664db8d85f7ea1035eb4", "0x011b95f2694bde28cd59a7216c52a32193b2a3cd0c07c1b4ea5a033da081adac"], ["0x1395ebd69cd992ed83b0f5e718b958e4a9040db47e7039de47a32af21379b362", "0x0d3e51fbae79bb9592ac0705a3fbc9584fd09f48acfe1ee7a1267bca9c4ba5e1"]],
         c: ["0x0a1ce2ac31828fbd24fb1d2fa9166f36ae05fd1cabaebd5ec1277a06f363c4eb", "0x1276aef0b435ef2f347895cf22ffab18ff975e5233633ab0a92d245dafc22df9"]
      };
      const pubSignals = ["1", threshold.toString()];
      
      // 3. ON-CHAIN VERIFICATION
      setStep(3);
      const tx = await contract.verifyProof(tokenId, proof.a, proof.b, proof.c, pubSignals);
      await tx.wait();
      
      navigate(`/details?id=${tokenId}`);
      
    } catch (err) {
      console.error(err);
      setError(err.reason || err.message || 'Verification failed.');
      setStep(0);
    } finally {
      if (step !== 1 || aiResult?.genuine) setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="text-center mb-8">
        <div style={{ 
          width: '64px', height: '64px', borderRadius: '50%', 
          background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', 
          justifyContent: 'center', margin: '0 auto 1.5rem', color: 'var(--accent)'
        }}>
          <Fingerprint className="w-8 h-8" />
        </div>
        <h1 className="page-title" style={{ fontSize: '2rem' }}>Authenticate Batch</h1>
        <p className="page-subtitle mb-0" style={{ margin: '0 auto' }}>
          Run AI pre-screening and generate a Zero-Knowledge Proof to verify authenticity.
        </p>
      </div>

      <div className="glass-card mb-6">
        {error && (
          <div className="flex gap-2" style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            <ShieldAlert className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
            <span>{error}</span>
          </div>
        )}

        {aiResult && !aiResult.genuine && (
          <div className="flex gap-2" style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            <ShieldAlert className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
            <div>
              <strong className="block mb-1">AI Pre-screen: Anomaly Detected</strong>
              <p>{aiResult.details.reason}</p>
              <p className="mt-2 text-xs opacity-70">ZK proof generation halted.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleVerify}>
          <div className="form-group">
            <label className="form-label">Token ID</label>
            <input 
              type="number" 
              className="form-input" 
              value={tokenId}
              onChange={e => setTokenId(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">HPLC Peak Profile (10 values)</label>
            <input 
              type="text" 
              className="form-input" 
              value={peaksStr}
              onChange={e => setPeaksStr(e.target.value)}
              required
              disabled={loading}
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Tolerance Threshold</label>
            <input 
              type="number" 
              className="form-input" 
              value={threshold}
              onChange={e => setThreshold(parseInt(e.target.value) || 0)}
              required
              disabled={loading}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-accent w-full"
            disabled={loading || !account}
            style={{ marginTop: '1rem' }}
          >
            {loading ? 'Processing...' : 'Verify Authenticity'}
          </button>
        </form>
      </div>

      {/* Progress Indicator */}
      {loading && (
        <div className="glass-card">
          <div className="flex flex-col gap-4">
            <div className={`flex items-center gap-3 ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
              {step > 1 ? <CheckCircle2 className="w-5 h-5 text-accent" /> : <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent"></div>}
              <span>Running AI Anomaly Detection...</span>
            </div>
            <div className={`flex items-center gap-3 ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
              {step > 2 ? <CheckCircle2 className="w-5 h-5 text-accent" /> : step === 2 ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent"></div> : <div className="w-5 h-5"></div>}
              <span>Generating Zero-Knowledge Proof...</span>
            </div>
            <div className={`flex items-center gap-3 ${step >= 3 ? 'opacity-100' : 'opacity-40'}`}>
               {step > 3 ? <CheckCircle2 className="w-5 h-5 text-accent" /> : step === 3 ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent"></div> : <div className="w-5 h-5"></div>}
              <span>Submitting Proof to Blockchain...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
