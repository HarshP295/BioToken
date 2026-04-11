// frontend/src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import MintToken from './pages/MintToken';
import VerifyToken from './pages/VerifyToken';
import TokenDetails from './pages/TokenDetails';
import { useContract } from './hooks/useContract';
import { Info } from 'lucide-react';

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

        {/* Global alert banners */}
        {(error || isWrongNetwork) && (
          <div style={{ padding: '0 1.5rem', maxWidth: 1220, margin: '1rem auto 0' }}>
            {error && !isWrongNetwork && (
              <div className="alert-banner alert-banner--error">
                <Info size={16} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Connection Error</strong>
                  <div style={{ marginTop: '0.2rem', fontSize: '0.82rem' }}>{error}</div>
                </div>
              </div>
            )}
            {isWrongNetwork && (
              <div className="alert-banner alert-banner--warning">
                <Info size={16} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Wrong Network</strong>
                  <div style={{ marginTop: '0.2rem', fontSize: '0.82rem' }}>
                    Please switch your wallet to the configured network to interact with BioToken.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <main className="main-content">
          <Routes>
            {/* Public landing page — always visible */}
            <Route path="/" element={<LandingPage />} />

            {/* App pages */}
            <Route path="/dashboard" element={<Dashboard contract={contract} account={account} />} />
            <Route path="/mint"      element={<MintToken  contract={contract} account={account} />} />
            <Route path="/verify"    element={<VerifyToken contract={contract} account={account} />} />
            <Route path="/details"   element={<TokenDetails contract={contract} account={account} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
