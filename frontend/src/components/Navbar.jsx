// frontend/src/components/Navbar.jsx
import { Link, useLocation } from 'react-router-dom';
import { Activity, PlusCircle, Search, Menu, X, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useRole } from '../hooks/useRole';

export function ConnectWalletButton() {
  const { login, logout, authenticated, user, ready } = useAuth()

  if (!ready) return <button className="btn btn-chain" disabled style={{ padding: '0.45rem 1.1rem', fontSize: '0.78rem' }}>Loading...</button>

  if (authenticated) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, color: '#6b7280' }}>
        {user?.email?.address ?? user?.wallet?.address?.slice(0, 6) + '...'}
      </span>
      <button onClick={logout} className="btn btn-chain btn-outline" style={{ padding: '0.45rem 1.1rem', fontSize: '0.78rem' }}>Sign out</button>
    </div>
  )

  return <button onClick={login} className="btn btn-chain" style={{ padding: '0.45rem 1.1rem', fontSize: '0.78rem' }}>Connect Wallet</button>
}

function BioTokenLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hexagon frame */}
      <path d="M14 2L24.39 7.5V18.5L14 24L3.61 18.5V7.5L14 2Z"
        stroke="#00C896" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(0,200,150,0.06)" />
      {/* DNA helix suggestion */}
      <circle cx="14" cy="9" r="1.5" fill="#00C896" />
      <circle cx="14" cy="14" r="1.5" fill="#4F46E5" />
      <circle cx="14" cy="19" r="1.5" fill="#00C896" />
      <path d="M10 9 Q14 11.5 18 9" stroke="#00C896" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M10 19 Q14 16.5 18 19" stroke="#00C896" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5" />
      <line x1="14" y1="9" x2="14" y2="19" stroke="#9CA3AF" strokeWidth="0.75" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

export default function Navbar({ account, connectWallet, isConnecting }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role } = useRole();

  // ── Role-aware navigation links ───────────────────────────────
  const allLinks = [
    // Manufacturer-only links
    { name: 'Dashboard',  path: '/dashboard', icon: <Activity size={14} />,    roles: ['manufacturer'] },
    { name: 'Mint Batch', path: '/mint',      icon: <PlusCircle size={14} />,  roles: ['manufacturer'] },
    // Lab-only links
    { name: 'Lab',        path: '/lab',       icon: <FlaskConical size={14} />,roles: ['lab'] },
    // Shared links
    { name: 'Lookup',     path: '/details',   icon: <Search size={14} />,      roles: ['manufacturer', 'lab'] },
  ];

  // Filter by current role. If no role selected yet, show nothing (role selection screen handles it).
  const navLinks = role
    ? allLinks.filter(link => link.roles.includes(role))
    : [];

  // Role badge
  const roleBadge = role === 'lab'
    ? { label: 'LAB', color: '#00C896' }
    : role === 'manufacturer'
    ? { label: 'MFR', color: '#4F46E5' }
    : null;

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(248,247,244,0.92)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        position: 'sticky',
        top: 0,
        zIndex: 200,
      }}>
        <div className="app-container" style={{ height: '3.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Logo */}
          <Link
            to="/"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.65rem',
              textDecoration: 'none', color: 'var(--text)',
            }}
          >
            <BioTokenLogo />
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: '1.05rem', letterSpacing: '-0.01em',
            }}>BioToken</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
              fontWeight: 600, color: 'var(--accent-dim)',
              background: 'rgba(0,200,150,0.1)', border: '1px solid rgba(0,200,150,0.25)',
              borderRadius: '9999px', padding: '0.1rem 0.5rem',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>v1.0</span>
            {/* Role badge */}
            {roleBadge && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                fontWeight: 700, color: roleBadge.color,
                background: `${roleBadge.color}12`,
                border: `1px solid ${roleBadge.color}30`,
                borderRadius: '9999px', padding: '0.1rem 0.5rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>{roleBadge.label}</span>
            )}
          </Link>

          {/* Desktop Nav Links */}
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }} className="desktop-nav">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.45rem 0.9rem',
                  borderRadius: 'var(--radius-full)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem', fontWeight: 600,
                  letterSpacing: '0.02em',
                  color: isActive(link.path) ? 'var(--accent-dim)' : 'var(--text-muted)',
                  background: isActive(link.path) ? 'rgba(0,200,150,0.08)' : 'transparent',
                  border: isActive(link.path) ? '1px solid rgba(0,200,150,0.2)' : '1px solid transparent',
                  transition: 'all 0.18s',
                  textDecoration: 'none',
                }}
              >
                {link.icon}
                {link.name}
              </Link>
            ))}
          </div>

          {/* Wallet + Mobile Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ConnectWalletButton />

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="mobile-menu-btn"
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: '0.4rem',
                cursor: 'pointer', color: 'var(--text-muted)',
                display: 'none',
              }}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: '1rem var(--space-6)',
            display: 'flex', flexDirection: 'column', gap: '0.25rem',
          }}>
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600,
                  color: isActive(link.path) ? 'var(--accent-dim)' : 'var(--text)',
                  background: isActive(link.path) ? 'rgba(0,200,150,0.06)' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                {link.icon} {link.name}
              </Link>
            ))}
          </div>
        )}
      </nav>
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
}
