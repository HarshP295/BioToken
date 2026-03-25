// frontend/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ExternalLink, ArrowRight } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard({ contract, account }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadTokens = async () => {
    if (!contract || !account) return;
    try {
      setLoading(true);
      setError('');
      
      // In a real app we'd use an indexer (The Graph) or emit events
      // For this demo, we'll brute force query the first 20 tokens
      const fetched = [];
      for (let i = 0; i < 20; i++) {
        try {
          const owner = await contract.ownerOf(i);
          const data = await contract.getTokenData(i);
          fetched.push({
            id: i,
            owner,
            batchId: data.batchId,
            expiry: Number(data.expiry),
            status: Number(data.status),
          });
        } catch (e) {
          // Token doesn't exist, we've reached the end
          break;
        }
      }
      setTokens(fetched.reverse()); // Newest first
    } catch (err) {
      console.error(err);
      setError('Failed to load tokens from contract.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, [contract, account]);

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh]">
        <h2 className="page-title mb-4">BioToken Provenance</h2>
        <p className="page-subtitle mb-8">Connect your wallet to view and interact with reagent batches.</p>
        <div style={{ padding: '2rem', border: '1px dashed var(--border)', borderRadius: '1rem', background: 'rgba(15, 23, 42, 0.4)' }}>
          <p style={{ color: 'var(--text-muted)' }}>Wallet disconnected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle mb-0">Overview of all reagent batches on-chain.</p>
        </div>
        
        <button 
          onClick={loadTokens} 
          disabled={loading}
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger)', marginBottom: '2rem' }}>
          {error}
        </div>
      )}

      {loading && tokens.length === 0 ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : tokens.length === 0 ? (
        <div className="glass-card text-center p-12">
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>No tokens found on this network.</p>
          <Link to="/mint" className="btn btn-primary">Mint First Batch</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {tokens.map(token => (
            <Link to={`/details?id=${token.id}`} key={token.id} className="glass-card" style={{ display: 'block', textDecoration: 'none' }}>
              <div className="flex justify-between items-center mb-4">
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                  {token.batchId}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  #{token.id}
                </span>
              </div>
              
              <div className="mb-6">
                <StatusBadge status={token.status} />
              </div>
              
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
                <div className="flex justify-between items-center" style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Owner</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
                    {token.owner.substring(0, 8)}...{token.owner.substring(38)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
