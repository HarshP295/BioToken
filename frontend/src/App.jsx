// frontend/src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import MintToken from './pages/MintToken';
import VerifyToken from './pages/VerifyToken';
import TokenDetails from './pages/TokenDetails';
import { useContract } from './hooks/useContract';

export default function App() {
  const { 
    contract, 
    account, 
    isConnecting, 
    error, 
    isWrongNetwork, 
    connectWallet 
  } = useContract();

  return (
    <BrowserRouter>
      <div className="app-layout">
        <Navbar 
          account={account} 
          connectWallet={connectWallet} 
          isConnecting={isConnecting} 
        />
        
        <main className="main-content app-container">
          {error && !isWrongNetwork && (
            <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger)', marginBottom: '2rem', borderRadius: '0.5rem' }}>
              <p style={{ color: 'white', fontWeight: 500 }}>Connection Error</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{error}</p>
            </div>
          )}

          {isWrongNetwork && (
            <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', borderLeft: '4px solid var(--warning)', marginBottom: '2rem', borderRadius: '0.5rem' }}>
              <p style={{ color: 'white', fontWeight: 500 }}>Wrong Network</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Please switch your wallet to the configured network to interact with BioToken.
              </p>
            </div>
          )}
          
          <Routes>
            <Route path="/" element={<Dashboard contract={contract} account={account} />} />
            <Route path="/mint" element={<MintToken contract={contract} account={account} />} />
            <Route path="/verify" element={<VerifyToken contract={contract} account={account} />} />
            <Route path="/details" element={<TokenDetails contract={contract} account={account} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
