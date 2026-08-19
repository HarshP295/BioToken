// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import LabDashboard from './pages/LabDashboard';
import MintToken from './pages/MintToken';
import VerifyToken from './pages/VerifyToken';

import TokenDetails from './pages/TokenDetails';
import RoleSelection from './pages/RoleSelection';
import { useContract } from './hooks/useContract';
import { useRole } from './hooks/useRole';
import { useAuth } from './hooks/useAuth';
import { Info, Loader2, RefreshCw } from 'lucide-react';

export default function App() {
  const {
    contract,
    account,
    isConnecting,
    error,
    isWrongNetwork,
    connectWallet
  } = useContract();

  const { authenticated, ready } = useAuth();
  const {
    role,
    needsRoleSelection,
    isRegistering,
    registerError,
    roleLoading,
    selectRole,
    pendingRole,
    rolePendingOnChain,
    retryRoleGrant,
  } = useRole();

  // Show role selection after Privy auth if no role is persisted
  const showRoleSelection = ready && authenticated && needsRoleSelection;

  // Still loading the wallet address from Privy — show a brief spinner
  const showRoleLoading = ready && authenticated && roleLoading && !needsRoleSelection;
  const showRolePending = ready && authenticated && rolePendingOnChain && !roleLoading;

  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* Hide navbar during role selection and loading */}
        {!showRoleSelection && !showRoleLoading && !showRolePending && (
          <Navbar
            account={account}
            connectWallet={connectWallet}
            isConnecting={isConnecting}
          />
        )}

        {/* Global alert banners */}
        {!showRoleSelection && !showRoleLoading && !showRolePending && (error || isWrongNetwork) && (
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
          {/* Loading spinner while waiting for Privy wallet */}
          {showRoleLoading && (
            <div style={{
              minHeight: '100vh',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '1.25rem',
            }}>
              <Loader2
                size={36}
                color="#00C896"
                style={{ animation: 'spin 1s linear infinite' }}
              />
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '0.85rem', color: '#6B7280',
              }}>
                Initializing wallet…
              </div>
            </div>
          )}

          {showRolePending && (
            <div style={{
              minHeight: '100vh', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '1rem',
              padding: '2rem', textAlign: 'center',
            }}>
              <Loader2 size={36} color="#00C896" style={{ animation: 'spin 1s linear infinite' }} />
              <h1 style={{ fontFamily: "'Libre Baskerville', serif", color: '#0d1f1a' }}>
                Role registration pending on-chain confirmation
              </h1>
              <p style={{ color: '#6B7280', maxWidth: 520 }}>
                Your {pendingRole} account is registered, but its smart-contract role is not active yet.
              </p>
              <button
                type="button"
                onClick={retryRoleGrant}
                disabled={isRegistering}
                className="btn btn-primary"
              >
                <RefreshCw size={16} />
                {isRegistering ? 'Retrying role grant…' : 'Retry role grant'}
              </button>
              {registerError && (
                <div className="alert-banner alert-banner--error">{registerError}</div>
              )}
            </div>
          )}

          {/* Full-screen role selection */}
          {showRoleSelection && (
            <RoleSelection
              onSelectRole={selectRole}
              isRegistering={isRegistering}
              registerError={registerError}
            />
          )}

          {/* Normal routing — only when role is resolved or user is unauthenticated */}
          {!showRoleSelection && !showRoleLoading && !showRolePending && (
            <Routes>
              {/* Public landing page — always visible */}
              <Route path="/" element={<LandingPage />} />

              {/* Manufacturer routes */}
              <Route path="/dashboard" element={
                authenticated && role !== 'manufacturer'
                  ? <Navigate to={role === 'lab' ? '/lab' : '/'} replace /> :
                <Dashboard contract={contract} account={account} />
              } />
              <Route path="/mint" element={
                authenticated && role !== 'manufacturer'
                  ? <Navigate to={role === 'lab' ? '/lab' : '/'} replace /> :
                <MintToken contract={contract} account={account} />
              } />


              {/* Lab routes */}
              <Route path="/lab" element={
                authenticated && role !== 'lab'
                  ? <Navigate to="/" replace />
                  : <LabDashboard />
              } />

              {/* Shared routes */}
              <Route path="/details" element={<TokenDetails contract={contract} account={account} />} />
              <Route path="/verify" element={<VerifyToken contract={contract} />} />
            </Routes>
          )}
        </main>
      </div>
    </BrowserRouter>
  );
}
