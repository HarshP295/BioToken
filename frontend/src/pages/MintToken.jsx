// frontend/src/pages/MintToken.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { PackageOpen, AlertCircle } from 'lucide-react';

export default function MintToken({ contract, account }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    batchId: `BATCH-${Math.floor(Math.random() * 10000)}`,
    expiryDays: 365,
  });

  const handleMint = async (e) => {
    e.preventDefault();
    if (!contract || !account) {
      setError('Please connect your wallet first.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const expiry = Math.floor(Date.now() / 1000) + (formData.expiryDays * 24 * 60 * 60);
      const vkHash = ethers.zeroPadValue(ethers.randomBytes(32), 32); // Mock VK commit for real-world integration
      
      console.log('Minting...', formData.batchId, expiry, vkHash);
      const tx = await contract.mintToken(formData.batchId, expiry, vkHash, "0x");
      
      console.log('Waiting for receipt...');
      const receipt = await tx.wait();
      
      // Parse event to get ID
      let tokenId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed.name === 'TokenMinted') {
            tokenId = parsed.args[0].toString();
            break;
          }
        } catch (e) {
          // Ignore logs from other contracts
        }
      }
      
      navigate(`/details?id=${tokenId || 0}`);
      
    } catch (err) {
      console.error(err);
      setError(err.reason || err.message || 'Minting failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="text-center mb-8">
        <div style={{ 
          width: '64px', height: '64px', borderRadius: '50%', 
          background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', 
          justifyContent: 'center', margin: '0 auto 1.5rem', color: 'var(--primary)'
        }}>
          <PackageOpen className="w-8 h-8" />
        </div>
        <h1 className="page-title" style={{ fontSize: '2rem' }}>Mint New Batch</h1>
        <p className="page-subtitle mb-0" style={{ margin: '0 auto' }}>
          Register a new reagent batch on the BioToken network. Requires MANUFACTURER_ROLE.
        </p>
      </div>

      <div className="glass-card">
        {error && (
          <div className="flex gap-2" style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger)', marginBottom: '1.5rem', color: 'var(--text-main)', fontSize: '0.9rem' }}>
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" style={{ color: 'var(--danger)' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleMint}>
          <div className="form-group">
            <label className="form-label">Batch Identifier</label>
            <input 
              type="text" 
              className="form-input" 
              value={formData.batchId}
              onChange={e => setFormData({...formData, batchId: e.target.value})}
              required
            />
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              A unique human-readable ID for physical labeling.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Days until Expiry</label>
            <input 
              type="number" 
              className="form-input" 
              value={formData.expiryDays}
              onChange={e => setFormData({...formData, expiryDays: parseInt(e.target.value) || 0})}
              min="1"
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary w-full"
            disabled={loading || !account}
            style={{ marginTop: '1rem' }}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Minting Transaction...
              </>
            ) : (
              'Mint Validation Token'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
