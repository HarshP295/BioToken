// frontend/src/pages/RoleSelection.jsx
// ─────────────────────────────────────────────────────────────────
// One-time role selection screen shown after Privy authentication
// when no role is persisted in localStorage for this wallet.
// ─────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Factory, FlaskConical, ArrowRight,
  ShieldCheck, Package, Beaker, Cpu,
} from 'lucide-react';
import DNABackground from '../components/DNABackground';

const ROLES = [
  {
    id: 'manufacturer',
    title: 'Manufacturer',
    subtitle: 'Produce & mint reagent batches',
    icon: Factory,
    color: '#4F46E5',
    gradient: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
    features: [
      { icon: <Package size={14} />, text: 'Mint reagent batch NFTs' },
      { icon: <Cpu size={14} />, text: 'Generate ZK commitments' },
      { icon: <ShieldCheck size={14} />, text: 'HPLC fingerprint capture' },
    ],
    redirectTo: '/',
  },
  {
    id: 'lab',
    title: 'Laboratory',
    subtitle: 'Verify & authenticate reagents',
    icon: FlaskConical,
    color: '#00C896',
    gradient: 'linear-gradient(135deg, #00C896 0%, #00E5A0 100%)',
    features: [
      { icon: <Beaker size={14} />, text: 'AI anomaly pre-screening' },
      { icon: <ShieldCheck size={14} />, text: 'Groth16 proof verification' },
      { icon: <FlaskConical size={14} />, text: 'On-chain batch authentication' },
    ],
    redirectTo: '/lab',
  },
];

export default function RoleSelection({ onSelectRole, isRegistering, registerError }) {
  const navigate = useNavigate();
  const [hoveredRole, setHoveredRole] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);

  const handleSelect = async (role) => {
    setSelectedRole(role.id);
    try {
      await onSelectRole(role.id);
      navigate(role.redirectTo);
    } catch {
      setSelectedRole(null);
    }
  };

  return (
    <>
      <DNABackground />

      <div style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '3rem 1.5rem',
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center', marginBottom: '3rem',
          maxWidth: 600,
        }} className="animate-fade-up">
          <div style={{
            width: 70, height: 70, borderRadius: '50%',
            background: 'rgba(0,200,150,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
            boxShadow: '0 0 0 12px rgba(0,200,150,0.04)',
          }}>
            <ShieldCheck size={32} color="#00C896" />
          </div>

          <h1 style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: 'clamp(2rem, 5vw, 2.8rem)',
            fontWeight: 700, color: '#0d1f1a',
            lineHeight: 1.15, marginBottom: '0.75rem',
          }}>
            Welcome to BioToken
          </h1>

          <p style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '1.05rem', color: '#6B7280',
            lineHeight: 1.8,
          }}>
            Select your role to get started. This determines your dashboard
            and available actions on the platform.
          </p>
        </div>

        {/* Role Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1.5rem',
          maxWidth: 720,
          width: '100%',
        }} className="role-cards-grid">
          {ROLES.map((role, i) => {
            const isHovered = hoveredRole === role.id;
            const isSelected = selectedRole === role.id;
            const isLoading = isRegistering && isSelected;
            const Icon = role.icon;

            return (
              <button
                key={role.id}
                onClick={() => handleSelect(role)}
                disabled={isRegistering}
                onMouseEnter={() => setHoveredRole(role.id)}
                onMouseLeave={() => setHoveredRole(null)}
                className="animate-fade-up"
                style={{
                  '--anim-delay': `${0.1 + i * 0.1}s`,
                  animation: `fadeUp 0.5s ease-out var(--anim-delay) both`,
                  background: '#ffffff',
                  borderRadius: '20px',
                  border: isHovered || isSelected
                    ? `2px solid ${role.color}`
                    : '2px solid #e0ede9',
                  padding: 0,
                  cursor: isRegistering ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  overflow: 'hidden',
                  transition: 'all 0.3s ease',
                  transform: isHovered ? 'translateY(-6px)' : 'none',
                  boxShadow: isHovered
                    ? `0 20px 40px ${role.color}20`
                    : '0 4px 24px rgba(0,0,0,0.07)',
                  opacity: isRegistering && !isSelected ? 0.5 : 1,
                }}
              >
                {/* Gradient header strip */}
                <div style={{
                  background: role.gradient,
                  padding: '1.75rem 1.75rem 1.5rem',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Decorative circles */}
                  <div style={{
                    position: 'absolute', top: -20, right: -20,
                    width: 80, height: 80, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                  }} />
                  <div style={{
                    position: 'absolute', bottom: -30, left: -10,
                    width: 60, height: 60, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                  }} />

                  <div style={{
                    width: 52, height: 52, borderRadius: '14px',
                    background: 'rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '1rem',
                  }}>
                    <Icon size={26} color="#fff" />
                  </div>

                  <div style={{
                    fontFamily: "'Libre Baskerville', serif",
                    fontSize: '1.35rem', fontWeight: 700,
                    color: '#fff', marginBottom: '0.25rem',
                  }}>{role.title}</div>

                  <div style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)',
                  }}>{role.subtitle}</div>
                </div>

                {/* Features list */}
                <div style={{ padding: '1.5rem 1.75rem 1.75rem' }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    gap: '0.75rem', marginBottom: '1.5rem',
                  }}>
                    {role.features.map((f, j) => (
                      <div key={j} style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        fontFamily: "'Courier New', monospace",
                        fontSize: '0.78rem', color: '#4B5563',
                      }}>
                        <span style={{ color: role.color, flexShrink: 0 }}>{f.icon}</span>
                        {f.text}
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    borderRadius: '12px',
                    background: isHovered || isSelected ? role.gradient : '#f7fbf9',
                    color: isHovered || isSelected ? '#fff' : role.color,
                    fontFamily: "'Libre Baskerville', serif",
                    fontSize: '0.88rem', fontWeight: 700,
                    transition: 'all 0.3s ease',
                    border: `1px solid ${isHovered || isSelected ? 'transparent' : `${role.color}30`}`,
                  }}>
                    {isLoading ? (
                      <>
                        <div style={{
                          width: 16, height: 16,
                          border: '2px solid rgba(255,255,255,0.4)',
                          borderTop: '2px solid #fff',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                        {role.id === 'lab' ? 'Granting LAB_ROLE…' : 'Registering…'}
                      </>
                    ) : (
                      <>
                        Continue as {role.title} <ArrowRight size={15} />
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {registerError && (
          <div style={{
            marginTop: '1.5rem', maxWidth: 720, width: '100%',
            padding: '1rem 1.25rem',
            background: 'rgba(255,77,77,0.06)',
            border: '1px solid rgba(255,77,77,0.2)',
            borderLeft: '3px solid #FF4D4D',
            borderRadius: '12px',
            fontFamily: "'Courier New', monospace",
            fontSize: '0.85rem', color: '#991B1B',
          }}>
            <strong>Registration Error:</strong> {registerError}
          </div>
        )}

        {/* Footer note */}
        <div style={{
          marginTop: '2.5rem',
          fontFamily: "'Courier New', monospace",
          fontSize: '0.72rem', color: '#9CA3AF',
          textAlign: 'center',
          maxWidth: 500,
          lineHeight: 1.7,
        }}>
          Your role is stored locally and cannot be changed later.
          Lab users receive <span style={{
            background: 'rgba(0,200,150,0.1)',
            border: '1px solid rgba(0,200,150,0.2)',
            padding: '0.05rem 0.4rem', borderRadius: '4px',
            color: '#00A87E',
          }}>LAB_ROLE</span> on the Polygon smart contract.
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .role-cards-grid {
            grid-template-columns: 1fr !important;
            max-width: 400px !important;
          }
        }
      `}</style>
    </>
  );
}
