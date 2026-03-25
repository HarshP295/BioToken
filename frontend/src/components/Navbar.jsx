// frontend/src/components/Navbar.jsx
import { Link, useLocation } from 'react-router-dom';
import { Beaker, Search, Shield, PlusCircle, Activity } from 'lucide-react';

export default function Navbar({ account, connectWallet, isConnecting }) {
  const location = useLocation();

  const navLinks = [
    { name: 'Dashboard', path: '/', icon: <Activity className="w-4 h-4" /> },
    { name: 'Mint Batch', path: '/mint', icon: <PlusCircle className="w-4 h-4" /> },
    { name: 'Verify', path: '/verify', icon: <Shield className="w-4 h-4" /> },
  ];

  const formatAddress = (addr) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <nav style={{ 
      borderBottom: '1px solid var(--border)',
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div className="app-container flex justify-between items-center" style={{ height: '4rem' }}>
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2" style={{ color: 'white', fontWeight: 'bold', fontSize: '1.25rem' }}>
            <Beaker className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            <span>BioToken</span>
          </Link>
          
          <div className="flex gap-2" style={{ marginLeft: '1rem' }}>
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className="flex items-center gap-2"
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  color: location.pathname === link.path ? 'white' : 'var(--text-muted)',
                  background: location.pathname === link.path ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                {link.icon}
                {link.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div style={{ position: 'relative' }}>
             <Link to="/details" style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem', borderRadius: '2rem',
                background: 'var(--bg-hover)', fontSize: '0.85rem'
             }}>
               <Search className="w-4 h-4" /> Lookup Token
             </Link>
          </div>
          
          {account ? (
            <div style={{
              padding: '0.5rem 1rem',
              borderRadius: '2rem',
              border: '1px solid var(--border)',
              background: 'rgba(15, 23, 42, 0.6)',
              fontSize: '0.9rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }}></div>
              {formatAddress(account)}
            </div>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={connectWallet}
              disabled={isConnecting}
              style={{ borderRadius: '2rem', padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
