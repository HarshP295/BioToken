// frontend/src/pages/LandingPage.jsx
import { Link } from 'react-router-dom';
import {
  Fingerprint, ShieldCheck, Cpu, ArrowRight, Zap, Globe, Lock,
  FlaskConical, Package, Truck, CheckCircle2, GitBranch
} from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';
import HplcWave from '../components/HplcWave';
import BlobDecor from '../components/BlobDecor';
import StatCard from '../components/StatCard';

/* ── Hero ────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '90vh',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #F8F7F4 0%, #EDFAF5 50%, #EEF0FF 100%)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <ParticleBackground style={{ opacity: 0.75 }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 80% 40%, rgba(0,200,150,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Two-column grid — no absolute positioning so nothing overlaps */}
      <div className="app-container hero-grid" style={{ position: 'relative', zIndex: 2, padding: '4rem 1.5rem', width: '100%' }}>
        {/* LEFT — text */}
        <div>
          <div className="animate-fade-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: 'rgba(0,200,150,0.1)', border: '1px solid rgba(0,200,150,0.3)',
            borderRadius: '9999px', padding: '0.35rem 1rem',
            fontSize: '0.72rem', fontFamily: 'var(--font-mono)', fontWeight: 600,
            color: 'var(--accent-dim)', letterSpacing: '0.1em', textTransform: 'uppercase',
            marginBottom: '1.5rem',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulseDot 1.4s ease-in-out infinite' }} />
            Live on Polygon Amoy Testnet
          </div>

          <h1 className="animate-fade-up anim-delay-1" style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.2rem, 4vw, 3.6rem)',
            fontWeight: 700, lineHeight: 1.1,
            color: 'var(--text)', marginBottom: '1.25rem',
          }}>
            Stop Counterfeit<br />
            <em style={{ fontStyle: 'italic', color: 'var(--accent-dim)' }}>Reagents</em>{' '}
            with ZK Proofs
          </h1>

          <p className="animate-fade-up anim-delay-2" style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.93rem',
            color: 'var(--text-muted)', lineHeight: 1.8,
            maxWidth: 480, marginBottom: '2.5rem',
          }}>
            BioToken cryptographically fingerprints reagent batches using AI-analysed
            HPLC profiles, commits them to an NFT on Polygon, and verifies authenticity
            via Zero-Knowledge Proofs — without revealing proprietary formulation data.
          </p>

          <div className="animate-fade-up anim-delay-3 flex gap-3" style={{ flexWrap: 'wrap' }}>
            <Link to="/dashboard" className="btn btn-accent" style={{ fontSize: '0.88rem', padding: '0.8rem 1.75rem' }}>
              <ShieldCheck size={16} /> Launch Lab View
            </Link>
            <Link to="/mint" className="btn btn-outline" style={{ fontSize: '0.88rem', padding: '0.8rem 1.75rem' }}>
              <Package size={16} /> Mint a Batch
            </Link>
            <a href="https://github.com/HarshP295/BioToken" target="_blank" rel="noopener noreferrer"
              className="btn btn-secondary" style={{ fontSize: '0.88rem', padding: '0.8rem 1.75rem' }}>
              <GitBranch size={16} /> GitHub
            </a>
          </div>

          <div className="animate-fade-up anim-delay-4" style={{
            display: 'flex', gap: '1.75rem', marginTop: '2.5rem',
            flexWrap: 'wrap', alignItems: 'center',
          }}>
            {['ZK-VERIFIED', 'ON-CHAIN NFT', 'AI PRE-SCREEN', 'POLYGON'].map(label => (
              <span key={label} style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                fontWeight: 600, letterSpacing: '0.12em',
                color: 'var(--text-faint)', textTransform: 'uppercase',
              }}>{label}</span>
            ))}
          </div>
        </div>

        {/* RIGHT — HPLC panel (pushed into its own column, no overlap) */}
        <div className="animate-fade-up anim-delay-2 hplc-panel" style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(14px)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem 1.75rem 1.25rem',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              HPLC Fingerprint — BATCH-0x7a3f
            </span>
            <span className="nft-badge nft-badge--verified">GENUINE</span>
          </div>
          <HplcWave style={{ width: '100%', height: 'auto' }} />
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            {[['ZK Proof', '0x1818...40'], ['Token ID', '#0042'], ['Chain', 'Polygon']].map(([k, v]) => (
              <div key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{k}</div>
                <span className="mono-tag">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .hero-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          align-items: center;
        }
        @media (max-width: 1024px) {
          .hero-grid { grid-template-columns: 1fr; }
          .hplc-panel { display: none !important; }
        }
      `}</style>
    </section>
  );
}

/* ── Problem Section ─────────────────────────────────────────── */
function ProblemSection() {
  const cards = [
    {
      icon: <Lock size={22} color="var(--alert)" />,
      bg: 'rgba(255,77,77,0.08)',
      border: '1px solid rgba(255,77,77,0.15)',
      title: 'No Verifiable Chain of Custody',
      desc: 'Paper-based COAs can be forged. Once a reagent leaves the manufacturer, there is zero cryptographic proof of authenticity or handling history.',
    },
    {
      icon: <Zap size={22} color="var(--warning)" />,
      bg: 'rgba(245,158,11,0.08)',
      border: '1px solid rgba(245,158,11,0.18)',
      title: 'Counterfeit Reagents Cost Millions',
      desc: 'The global counterfeit lab reagent market exceeds $5B annually. A single contaminated batch can invalidate months of research and put patients at risk.',
    },
    {
      icon: <Globe size={22} color="var(--chain)" />,
      bg: 'rgba(79,70,229,0.06)',
      border: '1px solid rgba(79,70,229,0.15)',
      title: 'Privacy vs. Transparency Paradox',
      desc: 'Sharing full formulation data to prove authenticity defeats competitive advantage. Labs need proof of integrity without revealing proprietary composition.',
    },
  ];

  return (
    <section style={{ padding: '6rem 0', position: 'relative', overflow: 'hidden', background: 'var(--surface-alt)' }}>
      <BlobDecor color="#00C896" opacity={0.08} size={350} top="-60px" right="-80px" delay={0} />
      <BlobDecor color="#4F46E5" opacity={0.06} size={280} bottom="-40px" left="-60px" delay={3} />

      <div className="app-container" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div className="section-label">The Problem</div>
          <h2 className="section-title">The Reagent Trust Gap</h2>
          <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.92rem', maxWidth: 560, margin: '0 auto', lineHeight: 1.8 }}>
            Life science research relies on reagent purity. But the supply chain has no
            cryptographic guarantees — until now.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {cards.map((card, i) => (
            <div key={i} className="lab-card animate-fade-up" style={{
              background: card.bg, border: card.border,
              animationDelay: `${i * 0.12}s`,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', marginBottom: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}>
                {card.icon}
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem', color: 'var(--text)' }}>{card.title}</h3>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How It Works ────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      num: '01',
      icon: <Fingerprint size={20} />,
      iconBg: 'rgba(0,200,150,0.12)',
      iconColor: 'var(--accent-dim)',
      title: 'AI Fingerprint',
      desc: 'HPLC peak profiles are analysed by a neural classifier. Statistical deviation from reference spectra flags anomalies before any blockchain interaction.',
    },
    {
      num: '02',
      icon: <Lock size={20} />,
      iconBg: 'rgba(79,70,229,0.10)',
      iconColor: 'var(--chain)',
      title: 'ZK Proof Generation',
      desc: 'A Groth16 proof is generated using circom circuits that commit to the fingerprint hash. Proves authenticity without revealing formulation data.',
    },
    {
      num: '03',
      icon: <Package size={20} />,
      iconBg: 'rgba(0,200,150,0.10)',
      iconColor: 'var(--accent-dim)',
      title: 'NFT Mint on Polygon',
      desc: 'The proof and batch metadata are committed to an ERC-721 token on Polygon Amoy. The NFT travels with the reagent through its entire lifecycle.',
    },
    {
      num: '04',
      icon: <ShieldCheck size={20} />,
      iconBg: 'rgba(79,70,229,0.10)',
      iconColor: 'var(--chain)',
      title: 'On-Chain Verification',
      desc: 'Any lab can scan the QR → submit the on-chain ZK verifier → read the MINTED / IN_TRANSIT / VERIFIED / CONSUMED status in under 2 seconds.',
    },
  ];

  return (
    <section style={{ padding: '6rem 0', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <BlobDecor color="#00C896" opacity={0.06} size={320} top="10%" left="-100px" delay={1} />

      <div className="app-container" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div className="section-label">How It Works</div>
          <h2 className="section-title">Four-Stage Provenance Pipeline</h2>
        </div>

        <div className="pipeline">
          {steps.map((step, i) => (
            <div key={i} className="pipeline-step animate-fade-up" style={{ animationDelay: `${i * 0.12}s` }}>
              <div className="pipeline-step__num">{step.num}</div>
              <div className="pipeline-step__icon" style={{ background: step.iconBg, color: step.iconColor }}>
                {step.icon}
              </div>
              <div className="pipeline-step__title">{step.title}</div>
              <p className="pipeline-step__desc">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* HPLC viz below steps */}
        <div style={{
          marginTop: '3.5rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Sample chromatogram fingerprint — reference vs. batch
            </span>
            <span className="mono-tag">Δ max = 4.2% — within tolerance ✓</span>
          </div>
          <HplcWave style={{ width: '100%', height: 'auto', maxHeight: '140px' }} />
        </div>
      </div>
    </section>
  );
}

/* ── Tech Stack — Animated 3D Icon Cards ─────────────────────── */
const TECHS = [
  {
    name: 'Polygon', desc: 'L2 Blockchain', color: '#7B3FE4', delay: 0,
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        <polygon points="24,3 42,13 42,35 24,45 6,35 6,13" stroke="#7B3FE4" strokeWidth="2" fill="rgba(123,63,228,0.07)" />
        <polygon points="24,13 34,19 34,29 24,35 14,29 14,19" stroke="#7B3FE4" strokeWidth="1.5" fill="rgba(123,63,228,0.15)" />
        <circle cx="24" cy="24" r="3" fill="#7B3FE4" />
        <line x1="24" y1="13" x2="24" y2="3" stroke="#7B3FE4" strokeWidth="1" opacity="0.4" />
        <line x1="34" y1="19" x2="42" y2="13" stroke="#7B3FE4" strokeWidth="1" opacity="0.4" />
        <line x1="34" y1="29" x2="42" y2="35" stroke="#7B3FE4" strokeWidth="1" opacity="0.4" />
        <line x1="24" y1="35" x2="24" y2="45" stroke="#7B3FE4" strokeWidth="1" opacity="0.4" />
        <line x1="14" y1="29" x2="6" y2="35" stroke="#7B3FE4" strokeWidth="1" opacity="0.4" />
        <line x1="14" y1="19" x2="6" y2="13" stroke="#7B3FE4" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
  },
  {
    name: 'circom', desc: 'ZK Circuits', color: '#00C896', delay: 0.15,
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="14" stroke="#00C896" strokeWidth="2" />
        <circle cx="24" cy="24" r="5" fill="rgba(0,200,150,0.3)" stroke="#00C896" strokeWidth="1.5" />
        <line x1="24" y1="10" x2="24" y2="4" stroke="#00C896" strokeWidth="2" />
        <line x1="38" y1="24" x2="44" y2="24" stroke="#00C896" strokeWidth="2" />
        <line x1="24" y1="38" x2="24" y2="44" stroke="#00C896" strokeWidth="2" />
        <line x1="10" y1="24" x2="4" y2="24" stroke="#00C896" strokeWidth="2" />
        <circle cx="24" cy="4" r="2" fill="#00C896" />
        <circle cx="44" cy="24" r="2" fill="#00C896" />
        <circle cx="24" cy="44" r="2" fill="#00C896" />
        <circle cx="4" cy="24" r="2" fill="#00C896" />
      </svg>
    ),
  },
  {
    name: 'snarkjs', desc: 'ZK Proofs', color: '#4F46E5', delay: 0.3,
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        <path d="M24 4 L40 11 L40 26 Q40 38 24 46 Q8 38 8 26 L8 11 Z" stroke="#4F46E5" strokeWidth="2" fill="rgba(79,70,229,0.08)" />
        <path d="M16 25 L21 30 L33 18" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="11" r="2" fill="#4F46E5" opacity="0.5" />
      </svg>
    ),
  },
  {
    name: 'Hardhat', desc: 'Smart Contracts', color: '#F59E0B', delay: 0.45,
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        <ellipse cx="24" cy="34" rx="17" ry="4" fill="rgba(245,158,11,0.2)" stroke="#F59E0B" strokeWidth="2" />
        <path d="M11 32 Q9 18 24 14 Q39 18 37 32" fill="rgba(245,158,11,0.12)" stroke="#F59E0B" strokeWidth="2" />
        <path d="M13 27 Q24 23 35 27" stroke="#F59E0B" strokeWidth="1.5" fill="none" />
        <circle cx="24" cy="14" r="3" fill="#F59E0B" opacity="0.7" />
        <line x1="24" y1="11" x2="24" y2="6" stroke="#F59E0B" strokeWidth="2" />
      </svg>
    ),
  },
  {
    name: 'IPFS', desc: 'Metadata Storage', color: '#65C3E8', delay: 0.6,
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="5" fill="#65C3E8" />
        <circle cx="10" cy="12" r="3.5" stroke="#65C3E8" strokeWidth="1.5" fill="rgba(101,195,232,0.2)" />
        <circle cx="38" cy="12" r="3.5" stroke="#65C3E8" strokeWidth="1.5" fill="rgba(101,195,232,0.2)" />
        <circle cx="10" cy="36" r="3.5" stroke="#65C3E8" strokeWidth="1.5" fill="rgba(101,195,232,0.2)" />
        <circle cx="38" cy="36" r="3.5" stroke="#65C3E8" strokeWidth="1.5" fill="rgba(101,195,232,0.2)" />
        <line x1="13" y1="14" x2="21" y2="21" stroke="#65C3E8" strokeWidth="1" />
        <line x1="35" y1="14" x2="27" y2="21" stroke="#65C3E8" strokeWidth="1" />
        <line x1="13" y1="34" x2="21" y2="27" stroke="#65C3E8" strokeWidth="1" />
        <line x1="35" y1="34" x2="27" y2="27" stroke="#65C3E8" strokeWidth="1" />
        <line x1="13" y1="12" x2="35" y2="12" stroke="#65C3E8" strokeWidth="0.75" opacity="0.5" />
        <line x1="10" y1="15" x2="10" y2="33" stroke="#65C3E8" strokeWidth="0.75" opacity="0.5" />
        <line x1="38" y1="15" x2="38" y2="33" stroke="#65C3E8" strokeWidth="0.75" opacity="0.5" />
        <line x1="13" y1="36" x2="35" y2="36" stroke="#65C3E8" strokeWidth="0.75" opacity="0.5" />
      </svg>
    ),
  },
  {
    name: 'React + Vite', desc: 'Frontend', color: '#61DAFB', delay: 0.75,
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="4" fill="#61DAFB" />
        <ellipse cx="24" cy="24" rx="20" ry="7" stroke="#61DAFB" strokeWidth="1.5" style={{ transformOrigin: '24px 24px', animation: 'techIconSpin 6s linear infinite' }} />
        <ellipse cx="24" cy="24" rx="20" ry="7" stroke="#61DAFB" strokeWidth="1.5" transform="rotate(60 24 24)" style={{ transformOrigin: '24px 24px', animation: 'techIconSpin 8s linear infinite reverse' }} />
        <ellipse cx="24" cy="24" rx="20" ry="7" stroke="#61DAFB" strokeWidth="1.5" transform="rotate(-60 24 24)" style={{ transformOrigin: '24px 24px', animation: 'techIconSpin 10s linear infinite' }} />
      </svg>
    ),
  },
  {
    name: 'ethers.js', desc: 'Web3 Bridge', color: '#6B7280', delay: 0.9,
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        <polygon points="24,4 40,24 24,44 8,24" stroke="#6B7280" strokeWidth="2" fill="rgba(107,114,128,0.07)" />
        <polygon points="24,4 40,24 24,27 8,24" fill="rgba(107,114,128,0.18)" />
        <line x1="8" y1="24" x2="40" y2="24" stroke="#6B7280" strokeWidth="1" />
        <line x1="8" y1="24" x2="24" y2="10" stroke="#6B7280" strokeWidth="1" opacity="0.4" />
        <line x1="40" y1="24" x2="24" y2="10" stroke="#6B7280" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
  },
  {
    name: 'ERC-721', desc: 'NFT Standard', color: '#FF4D4D', delay: 1.05,
    icon: (
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="8" y="8" width="32" height="32" rx="6" stroke="#FF4D4D" strokeWidth="2" fill="rgba(255,77,77,0.07)" />
        <rect x="14" y="14" width="20" height="20" rx="3" stroke="#FF4D4D" strokeWidth="1.2" fill="rgba(255,77,77,0.1)" />
        <text x="24" y="28" textAnchor="middle" fontSize="10" fontWeight="700" fill="#FF4D4D" fontFamily="monospace">NFT</text>
        <circle cx="38" cy="10" r="4" fill="#FF4D4D" />
        <text x="38" y="13" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fff" fontFamily="monospace">⬡</text>
      </svg>
    ),
  },
];

function TechStack() {
  return (
    <section style={{ padding: '5rem 0', background: 'var(--surface-alt)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
      <div className="app-container">
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div className="section-label">Tech Stack</div>
          <h2 className="section-title">Built on Proven Infrastructure</h2>
          <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: 480, margin: '0 auto' }}>
            Every component chosen for security, verifiability, and decentralisation.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.25rem' }}>
          {TECHS.map((tech, i) => (
            <div key={tech.name}
              className="tech-card-3d animate-fade-up"
              style={{ animationDelay: `${i * 0.08}s`, '--float-delay': `${tech.delay}s`, '--card-color': tech.color }}
            >
              <div className="tech-icon-orb" style={{ borderColor: `${tech.color}30`, background: `${tech.color}08` }}>
                {tech.icon}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
                {tech.name}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {tech.desc}
              </div>
              <div className="tech-card-glow" style={{ background: `radial-gradient(circle at 50% 0%, ${tech.color}22, transparent 70%)` }} />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes techFloat {
          0%,100% { transform: translateY(0) perspective(600px) rotateX(0deg); }
          50%      { transform: translateY(-8px) perspective(600px) rotateX(3deg); }
        }
        @keyframes techIconSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .tech-card-3d {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.75rem 1.25rem 1.5rem;
          text-align: center;
          position: relative;
          overflow: hidden;
          cursor: default;
          animation: techFloat 5s ease-in-out var(--float-delay, 0s) infinite;
          transition: transform 0.35s cubic-bezier(0.23,1,0.32,1), box-shadow 0.35s ease, border-color 0.25s;
          will-change: transform;
        }
        .tech-card-3d:hover {
          transform: perspective(600px) rotateY(12deg) rotateX(6deg) translateY(-10px) scale(1.04) !important;
          box-shadow: 0 24px 48px rgba(0,0,0,0.12), -8px 8px 24px rgba(0,0,0,0.06);
          border-color: var(--card-color, var(--border-strong));
          animation-play-state: paused;
        }
        .tech-icon-orb {
          width: 68px; height: 68px;
          border-radius: 50%;
          border: 1.5px solid;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 1.1rem;
          transition: transform 0.4s ease;
        }
        .tech-card-3d:hover .tech-icon-orb {
          transform: scale(1.1) rotate(-6deg);
        }
        .tech-icon-orb svg { width: 42px; height: 42px; }
        .tech-card-glow {
          position: absolute; inset: 0;
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        .tech-card-3d:hover .tech-card-glow { opacity: 1; }
      `}</style>
    </section>
  );
}

/* ── Stats ───────────────────────────────────────────────────── */
function Stats() {
  return (
    <section style={{ padding: '6rem 0', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <BlobDecor color="#4F46E5" opacity={0.06} size={400} top="-80px" right="-100px" delay={2} />

      <div className="app-container" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div className="section-label">Evaluation Metrics</div>
          <h2 className="section-title">Numbers That Matter</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
          <StatCard value="99.2" suffix="%" label="AI Classification Accuracy" delay={0} />
          <StatCard value="1.8" suffix="s" label="End-to-End Verify Time" delay={0.15} />
          <StatCard value="0" suffix="" label="False Positive Rate" delay={0.3} />
          <StatCard value="100" suffix="%" label="Tamper Detection Rate" delay={0.45} />
        </div>
      </div>
    </section>
  );
}

/* ── Team ────────────────────────────────────────────────────── */
function Team() {
  const members = [
    { initials: 'KS', name: 'Khushi Singh', role: 'Blockchain & ZK Engineer', color: 'var(--chain)' },
    { initials: 'HP', name: 'Harsh Patil', role: 'HPLC Fingerprinting & ML', color: 'var(--accent-dim)' },
    { initials: 'IK', name: 'Ishaan Khan', role: 'Protocol Architect', role: 'Smart Contracts & Circuit Design', color: '#F59E0B' },
  ];

  return (
    <section style={{ padding: '5rem 0', background: 'var(--surface-alt)', borderTop: '1px solid var(--border)' }}>
      <div className="app-container">
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div className="section-label">The Team</div>
          <h2 className="section-title">Who Built This</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', maxWidth: 800, margin: '0 auto' }}>
          {members.map((m, i) => (
            <div key={i} className="lab-card animate-fade-up" style={{
              textAlign: 'center',
              animationDelay: `${i * 0.12}s`,
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: m.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700,
                margin: '0 auto 1rem',
              }}>{m.initials}</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600, marginBottom: '0.3rem' }}>{m.name}</h3>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{m.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA Footer Banner ───────────────────────────────────────── */
function CtaBanner() {
  return (
    <section style={{
      padding: '5rem 0',
      background: 'linear-gradient(135deg, #0A0A0A 0%, #1a1a2e 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <BlobDecor color="#00C896" opacity={0.12} size={350} top="-60px" right="-80px" delay={0} />
      <BlobDecor color="#4F46E5" opacity={0.10} size={280} bottom="-40px" left="-60px" delay={2} />
      <div className="app-container" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <div className="section-label" style={{ color: 'var(--accent)' }}>Ready to Authenticate?</div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
          fontWeight: 700, color: '#fff', margin: '0.75rem 0 1.25rem', lineHeight: 1.2,
        }}>
          Eliminate Counterfeit Reagents<br />from Your Lab, Forever
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Connect your wallet to start minting provenance tokens today.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/mint" className="btn btn-accent" style={{ padding: '0.85rem 2rem', fontSize: '0.9rem' }}>
            <FlaskConical size={16} /> Mint Your First Batch <ArrowRight size={16} />
          </Link>
          <Link to="/verify" className="btn btn-outline" style={{ padding: '0.85rem 2rem', fontSize: '0.9rem', borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
            <ShieldCheck size={16} /> Verify Authenticity
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Page Assembly ───────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div>
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <TechStack />
      <Stats />
      <Team />
      <CtaBanner />
    </div>
  );
}
