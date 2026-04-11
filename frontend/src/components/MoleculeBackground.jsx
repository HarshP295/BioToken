// frontend/src/components/MoleculeBackground.jsx
// Canvas-based molecular animation: benzene rings, DNA helix, CRISPR, water, carbon chains
import { useEffect, useRef } from 'react';

/* ── Drawing Primitives ─────────────────────────────────────── */
function drawBenzene(ctx, x, y, r, angle, op) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = op;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const [nx, ny] = pts[(i + 1) % 6];
    ctx.moveTo(px, py); ctx.lineTo(nx, ny);
  });
  ctx.strokeStyle = '#00C896'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.53, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,200,150,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  pts.forEach(([px, py]) => {
    ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#00C896'; ctx.fill();
  });
  ctx.restore();
}

function drawDNA(ctx, x, y, W, H, t, op) {
  ctx.save();
  ctx.translate(x, y - H / 2);
  ctx.globalAlpha = op;
  const steps = 22;
  // Strand 1
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const py = (i / steps) * H;
    const px = (W / 2) * Math.sin((py / H) * Math.PI * 4 + t);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.strokeStyle = '#4F46E5'; ctx.lineWidth = 2; ctx.stroke();
  // Strand 2
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const py = (i / steps) * H;
    const px = (W / 2) * Math.sin((py / H) * Math.PI * 4 + t + Math.PI);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.strokeStyle = '#00C896'; ctx.lineWidth = 2; ctx.stroke();
  // Rungs
  for (let i = 2; i < steps; i += 3) {
    const py = (i / steps) * H;
    const px1 = (W / 2) * Math.sin((py / H) * Math.PI * 4 + t);
    const px2 = (W / 2) * Math.sin((py / H) * Math.PI * 4 + t + Math.PI);
    ctx.beginPath(); ctx.moveTo(px1, py); ctx.lineTo(px2, py);
    ctx.strokeStyle = 'rgba(156,163,175,0.55)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}

function drawWater(ctx, x, y, r, angle, op) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = op;
  const BA = 52 * (Math.PI / 180);
  // O
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,77,77,0.18)'; ctx.fill();
  ctx.strokeStyle = '#FF4D4D'; ctx.lineWidth = 1.5; ctx.stroke();
  // H atoms
  [BA, -BA].forEach(ba => {
    const hx = (r + 16) * Math.sin(ba), hy = -(r + 16) * Math.cos(ba);
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(hx, hy);
    ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(156,163,175,0.2)'; ctx.fill();
    ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.fillStyle = '#FF4D4D'; ctx.font = `${r * 0.85}px monospace`;
  ctx.textAlign = 'center'; ctx.fillText('O', 0, r * 0.3);
  ctx.restore();
}

function drawCRISPR(ctx, x, y, sz, t, op) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = op;
  // Cas9 protein blob (simplified)
  const blob = [[-sz*.8,0],[-sz*.5,-sz*.7],[0,-sz*.5],[sz*.3,-sz*.3],[sz*.1,sz*.4],[-sz*.4,sz*.5]];
  ctx.beginPath();
  ctx.moveTo(blob[0][0], blob[0][1]);
  blob.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
  ctx.closePath();
  ctx.fillStyle = 'rgba(79,70,229,0.07)'; ctx.fill();
  ctx.strokeStyle = 'rgba(79,70,229,0.28)'; ctx.lineWidth = 1.5; ctx.stroke();
  // DNA strands through protein
  const dy = sz * 0.1;
  ctx.beginPath(); ctx.moveTo(-sz*1.2, dy-4); ctx.lineTo(sz*1.2, dy-4);
  ctx.strokeStyle = '#4F46E5'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-sz*1.2, dy+4); ctx.lineTo(sz*1.2, dy+4);
  ctx.strokeStyle = '#00C896'; ctx.lineWidth = 2; ctx.stroke();
  // Cut-site dashes
  ctx.beginPath(); ctx.moveTo(0, dy-12); ctx.lineTo(0, dy+12);
  ctx.strokeStyle = 'rgba(255,77,77,0.5)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

function drawChain(ctx, x, y, n, bond, angle, op) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = op;
  const positions = Array.from({ length: n }, (_, i) => [
    (i - (n - 1) / 2) * bond,
    i % 2 === 0 ? 0 : -bond * 0.45,
  ]);
  ctx.beginPath();
  positions.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
  ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 1.5; ctx.stroke();
  positions.forEach(([px, py]) => {
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(107,114,128,0.25)'; ctx.fill();
    ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.restore();
}

/* ── Scene config ───────────────────────────────────────────── */
const MOLS = [
  { type:'benzene', rx:.10, ry:.18, r:30, sp:.40, ph:0,   op:.15 },
  { type:'benzene', rx:.82, ry:.72, r:24, sp:.30, ph:2,   op:.12 },
  { type:'benzene', rx:.48, ry:.88, r:36, sp:.25, ph:1,   op:.10 },
  { type:'benzene', rx:.62, ry:.15, r:20, sp:.35, ph:3.5, op:.10 },
  { type:'dna',     rx:.14, ry:.55, w:52, h:140, sp:.14, ph:.5,  op:.14 },
  { type:'dna',     rx:.80, ry:.28, w:46, h:115, sp:.11, ph:2,   op:.12 },
  { type:'dna',     rx:.40, ry:.40, w:40, h:100, sp:.16, ph:1.2, op:.10 },
  { type:'water',   rx:.72, ry:.82, r:11, sp:.50, ph:1,   op:.18 },
  { type:'water',   rx:.28, ry:.12, r: 9, sp:.44, ph:0,   op:.16 },
  { type:'crispr',  rx:.55, ry:.35, sz:38, sp:.09, ph:3,  op:.13 },
  { type:'crispr',  rx:.20, ry:.75, sz:30, sp:.11, ph:0.8,op:.10 },
  { type:'chain',   rx:.35, ry:.68, n:5,  bond:19, sp:.20, ph:1.5, op:.15 },
  { type:'chain',   rx:.74, ry:.52, n:4,  bond:17, sp:.24, ph:0.2, op:.12 },
  { type:'chain',   rx:.88, ry:.10, n:6,  bond:15, sp:.18, ph:2.5, op:.10 },
];

export default function MoleculeBackground({ style = {} }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId, W, H, t = 0;

    const resize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += 0.007;

      MOLS.forEach(m => {
        const x = m.rx * W;
        const y = m.ry * H + Math.sin(t * m.sp + m.ph) * 14;
        const angle = t * m.sp * 0.6 + m.ph;
        const op = m.op * (0.65 + 0.35 * Math.sin(t * 0.4 + m.ph));

        if (m.type === 'benzene')  drawBenzene(ctx, x, y, m.r, angle, op);
        if (m.type === 'dna')      drawDNA(ctx, x, y, m.w, m.h, t * m.sp + m.ph, op);
        if (m.type === 'water')    drawWater(ctx, x, y, m.r, angle, op);
        if (m.type === 'crispr')   drawCRISPR(ctx, x, y, m.sz, t, op);
        if (m.type === 'chain')    drawChain(ctx, x, y, m.n, m.bond, angle, op);
      });

      animId = requestAnimationFrame(draw);
    };

    resize(); draw();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position:'absolute', inset:0, width:'100%', height:'100%', display:'block', ...style }}
      aria-hidden="true"
    />
  );
}
