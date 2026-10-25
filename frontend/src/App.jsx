// frontend/src/App.jsx
import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import { useRole } from './hooks/useRole';
import { useAuth } from './hooks/useAuth';
import { AlertTriangle, Loader2, RefreshCw, Repeat, LogOut, Wallet } from 'lucide-react';

// Pages behind sign-in are loaded on demand, so the landing page (and the
// wallet start-up) does not wait for the dashboards' code.
const Dashboard     = lazy(() => import('./pages/Dashboard'));
const LabDashboard  = lazy(() => import('./pages/LabDashboard'));
const MintToken     = lazy(() => import('./pages/MintToken'));
const VerifyToken   = lazy(() => import('./pages/VerifyToken'));
const TokenDetails  = lazy(() => import('./pages/TokenDetails'));
const RoleSelection = lazy(() => import('./pages/RoleSelection'));

function Spinner({ label, hint }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1.25rem', padding: '2rem', textAlign: 'center',
    }}>
      <Loader2 size={36} color="#00C896" style={{ animation: 'spin 1s linear infinite' }} />
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', color: '#6B7280' }}>
        {label}
      </div>
      {hint && (
        <p style={{ color: '#9CA3AF', fontSize: '0.82rem', maxWidth: 420, lineHeight: 1.6 }}>{hint}</p>
      )}
    </div>
  );
}

function StatusScreen({ icon, title, children, actions }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1rem',
      padding: '2rem', textAlign: 'center',
    }}>
      {icon}
      <h1 style={{ fontFamily: "'Libre Baskerville', serif", color: '#0d1f1a', fontSize: '1.6rem' }}>{title}</h1>
      <div style={{ color: '#6B7280', maxWidth: 520, lineHeight: 1.6 }}>{children}</div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {actions}
      </div>
    </div>
  );
}

export default function App() {
  const { authenticated, ready, logout, user, createWallet, connectWallet } = useAuth();
  const {
    status,
    role,
    pendingRole,
    awaitingApproval,
    needsRoleSelection,
    choosingRole,
    slow,
    loadError,
    isRegistering,
    registerError,
    selectRole,
    retryRoleGrant,
    refresh,
    changeRole,
    cancelChangeRole,
  } = useRole();
  const [walletActionError, setWalletActionError] = useState(null);

  const signedIn = ready && authenticated;
  const showRoleSelection = signedIn && needsRoleSelection;
  // 'signed-out' while signed in is the first render after Privy is ready,
  // before RoleContext has started the role lookup. Treat it as loading so the
  // route guards below don't redirect a deep link (e.g. /mint) before the role is known.
  const showGate = signedIn && !showRoleSelection
    && ['signed-out', 'waiting-wallet', 'no-wallet', 'checking', 'pending', 'error'].includes(status);
  const showApp = !showRoleSelection && !showGate;

  const handleCreateWallet = async () => {
    setWalletActionError(null);
    try {
      await createWallet();
      refresh();
    } catch (err) {
      setWalletActionError(err?.message || 'Could not create a wallet');
    }
  };

  const signOutButton = (
    <button type="button" onClick={logout} className="btn btn-outline">
      <LogOut size={16} /> Sign out
    </button>
  );
  const chooseRoleButton = (
    <button type="button" onClick={changeRole} className="btn btn-outline" disabled={isRegistering}>
      <Repeat size={16} /> Choose a different role
    </button>
  );

  let gate = null;
  if (showGate) {
    if (status === 'signed-out') {
      gate = <Spinner label="Loading your account…" />;
    } else if (status === 'waiting-wallet') {
      gate = <Spinner label="Setting up your wallet…" />;
    } else if (status === 'checking') {
      gate = (
        <Spinner
          label="Loading your account…"
          hint={slow ? 'The BioToken server is waking up. On free hosting this can take up to a minute after a quiet period.' : null}
        />
      );
    } else if (status === 'no-wallet') {
      const hasWallet = Boolean(user?.wallet);
      const isEmbedded = user?.wallet?.walletClientType === 'privy';
      gate = (
        <StatusScreen
          icon={<Wallet size={36} color="#F59E0B" />}
          title="Your wallet did not load"
          actions={<>
            {!hasWallet && (
              <button type="button" onClick={handleCreateWallet} className="btn btn-primary">
                <Wallet size={16} /> Create wallet
              </button>
            )}
            {hasWallet && !isEmbedded && (
              <button type="button" onClick={() => connectWallet()} className="btn btn-primary">
                <Wallet size={16} /> Reconnect wallet
              </button>
            )}
            <button type="button" onClick={() => window.location.reload()} className={hasWallet && isEmbedded ? 'btn btn-primary' : 'btn btn-outline'}>
              <RefreshCw size={16} /> Reload page
            </button>
            {signOutButton}
          </>}
        >
          {!hasWallet
            ? 'This account has no wallet yet. Create one to continue.'
            : isEmbedded
              ? 'Your BioToken wallet is taking too long to start. Reloading the page usually fixes this.'
              : 'Your external wallet is locked or disconnected. Unlock it and reconnect.'}
          {walletActionError && (
            <div className="alert-banner alert-banner--error" style={{ marginTop: '1rem' }}>{walletActionError}</div>
          )}
        </StatusScreen>
      );
    } else if (status === 'error') {
      gate = (
        <StatusScreen
          icon={<AlertTriangle size={36} color="#FF4D4D" />}
          title="Could not load your account"
          actions={<>
            <button type="button" onClick={refresh} className="btn btn-primary">
              <RefreshCw size={16} /> Try again
            </button>
            <button type="button" onClick={changeRole} className="btn btn-outline">
              <Repeat size={16} /> Choose a role
            </button>
            {signOutButton}
          </>}
        >
          {loadError}
        </StatusScreen>
      );
    } else if (status === 'pending') {
      gate = (
        <StatusScreen
          icon={<Loader2 size={36} color="#00C896" style={{ animation: 'spin 1s linear infinite' }} />}
          title={awaitingApproval ? 'Role registration awaiting approval' : 'Role registration pending on-chain confirmation'}
          actions={<>
            <button type="button" onClick={retryRoleGrant} disabled={isRegistering} className="btn btn-primary">
              <RefreshCw size={16} />
              {isRegistering ? 'Checking…' : awaitingApproval ? 'Check again' : 'Retry role grant'}
            </button>
            {chooseRoleButton}
            {signOutButton}
          </>}
        >
          {awaitingApproval
            ? `Your ${pendingRole} registration was received. An administrator must approve it before the role is granted on-chain; check again afterwards.`
            : `Your ${pendingRole} account is registered, but its smart-contract role is not active on the current contract yet.`}
          {registerError && (
            <div className="alert-banner alert-banner--error" style={{ marginTop: '1rem' }}>{registerError}</div>
          )}
        </StatusScreen>
      );
    }
  }

  return (
    <BrowserRouter>
      <div className="app-layout">
        {showApp && <Navbar />}

        <main className="main-content">
          <Suspense fallback={<Spinner label="Loading…" />}>
            {gate}

            {showRoleSelection && (
              <RoleSelection
                onSelectRole={selectRole}
                isRegistering={isRegistering}
                registerError={registerError}
                currentRole={role || pendingRole}
                activeRole={role}
                onCancel={choosingRole && status !== 'needs-role' ? cancelChangeRole : undefined}
              />
            )}

            {/* Normal routing — only when the role is resolved or the user is signed out */}
            {showApp && (
              <Routes>
                {/* Public landing page — always visible */}
                <Route path="/" element={<LandingPage />} />

                {/* Manufacturer routes */}
                <Route path="/dashboard" element={
                  authenticated && role !== 'manufacturer'
                    ? <Navigate to={role === 'lab' ? '/lab' : '/'} replace />
                    : <Dashboard />
                } />
                <Route path="/mint" element={
                  authenticated && role !== 'manufacturer'
                    ? <Navigate to={role === 'lab' ? '/lab' : '/'} replace />
                    : <MintToken />
                } />

                {/* Lab routes */}
                <Route path="/lab" element={
                  authenticated && role !== 'lab'
                    ? <Navigate to={role === 'manufacturer' ? '/dashboard' : '/'} replace />
                    : <LabDashboard />
                } />

                {/* Shared routes */}
                <Route path="/details" element={<TokenDetails />} />
                <Route path="/verify" element={<VerifyToken />} />
              </Routes>
            )}
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
}
