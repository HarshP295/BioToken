// frontend/src/pages/TokenDetails.jsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Send, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge, { STAGES } from '../components/StatusBadge';

export default function TokenDetails({ contract, account }) {
  const [searchParams] = useSearchParams();
  const tokenId = searchParams.get('id');
  
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    if (!contract || !tokenId) return;
    try {
      setLoading(true);
      setError('');
      const owner = await contract.ownerOf(tokenId);
      const data = await contract.getTokenData(tokenId);
      
      setToken({
        id: tokenId,
        owner,
        batchId: data.batchId,
        expiry: new Date(Number(data.expiry) * 1000).toLocaleString(),
        status: Number(data.status),
        vkHash: data.verificationKey
      });
    } catch (err) {
      console.error(err);
      setError('Token not found or error loading data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (contract) loadData();
  }, [contract, tokenId]);

  const handleAction = async (actionType) => {
    try {
      setActionLoading(true);
      let tx;
      
      if (actionType === 'transfer') {
        const dummyLabAddress = "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199"; // just for demo UI
        tx = await contract.transferCustody(tokenId, dummyLabAddress);
      } else if (actionType === 'receive') {
        tx = await contract.confirmReceipt(tokenId);
      } else if (actionType === 'consume') {
        tx = await contract.consumeToken(tokenId);
      }
      
      await tx.wait();
      await loadData(); // refresh data
    } catch (err) {
      console.error(err);
      alert(err.reason || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  if (error || !token) {
    return (
      <div className="text-center p-12">
        <h2 className="text-2xl mb-4">Token Not Found</h2>
        <Link to="/" className="btn btn-secondary">Current Dashboard</Link>
      </div>
    );
  }

  const statusNum = token.status;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="flex justify-between items-center mb-8">
        <Link to="/" className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.5rem 1rem' }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <button onClick={loadData} disabled={actionLoading} className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.5rem 1rem' }}>
          <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="glass-card mb-8">
        <div className="flex justify-between items-start mb-6 pb-6" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h1 className="page-title" style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{token.batchId}</h1>
            <p style={{ color: 'var(--text-muted)' }}>Token #{token.id}</p>
          </div>
          <StatusBadge status={token.status} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Current Owner</p>
              <p style={{ fontFamily: 'monospace', fontWeight: '500' }}>{token.owner}</p>
            </div>
            
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Expiry Date</p>
              <p>{token.expiry}</p>
            </div>
          </div>
          
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Verification Key Committment</p>
            <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.8, overflowWrap: 'break-word', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '0.25rem' }}>
              {token.vkHash}
            </p>
          </div>
        </div>
      </div>

      {/* Lifecycle Progress Bar */}
      <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Lifecycle Actions</h3>
      <div className="glass-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div className="flex justify-between items-center" style={{ padding: '1rem', background: statusNum >= 0 ? 'rgba(59, 130, 246, 0.1)' : 'transparent', borderRadius: '0.5rem', border: statusNum >= 0 ? '1px solid var(--primary)' : '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: statusNum >= 0 ? 'var(--primary)' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <span style={{ fontWeight: 500 }}>1. Minted</span>
            </div>
            {statusNum === 0 && (
              <button className="btn btn-secondary text-sm" onClick={() => handleAction('transfer')} disabled={actionLoading}>
                <Send className="w-4 h-4" /> Transit to Lab
              </button>
            )}
          </div>

          <div className="flex justify-between items-center" style={{ padding: '1rem', background: statusNum >= 1 ? 'rgba(245, 158, 11, 0.1)' : 'transparent', borderRadius: '0.5rem', border: statusNum >= 1 ? '1px solid var(--warning)' : '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: statusNum >= 1 ? 'var(--warning)' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <span style={{ fontWeight: 500, opacity: statusNum >= 1 ? 1 : 0.5 }}>2. In Transit</span>
            </div>
            {statusNum === 1 && (
              <button className="btn btn-secondary text-sm" onClick={() => handleAction('receive')} disabled={actionLoading}>
                Confirm Receipt
              </button>
            )}
          </div>

          <div className="flex justify-between items-center" style={{ padding: '1rem', background: statusNum >= 2 ? 'rgba(255, 255, 255, 0.1)' : 'transparent', borderRadius: '0.5rem', border: statusNum >= 2 ? '1px solid rgba(255,255,255,0.3)' : '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: statusNum >= 2 ? '#fff' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 className="w-4 h-4" style={{ color: statusNum >= 2 ? '#000' : '#fff' }} />
              </div>
              <span style={{ fontWeight: 500, opacity: statusNum >= 2 ? 1 : 0.5 }}>3. Received By Lab</span>
            </div>
            {statusNum === 2 && (
              <Link to={`/verify?id=${tokenId}`} className="btn btn-primary text-sm">
                Initiate AI + ZK Verification
              </Link>
            )}
          </div>

          <div className="flex justify-between items-center" style={{ padding: '1rem', background: statusNum >= 3 ? 'rgba(16, 185, 129, 0.1)' : 'transparent', borderRadius: '0.5rem', border: statusNum >= 3 ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: statusNum >= 3 ? 'var(--accent)' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <span style={{ fontWeight: 500, opacity: statusNum >= 3 ? 1 : 0.5 }}>4. Authenticity Verified</span>
            </div>
            {statusNum === 3 && (
              <button className="btn btn-secondary text-sm" onClick={() => handleAction('consume')} disabled={actionLoading}>
                Consume Reagent
              </button>
            )}
          </div>

          <div className="flex justify-between items-center" style={{ padding: '1rem', background: statusNum >= 4 ? 'rgba(239, 68, 68, 0.1)' : 'transparent', borderRadius: '0.5rem', border: statusNum >= 4 ? '1px solid var(--danger)' : '1px solid var(--border)' }}>
             <div className="flex items-center gap-3">
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: statusNum >= 4 ? 'var(--danger)' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <span style={{ fontWeight: 500, opacity: statusNum >= 4 ? 1 : 0.5 }}>5. Consumed</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
