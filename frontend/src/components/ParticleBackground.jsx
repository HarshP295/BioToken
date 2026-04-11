// frontend/src/components/ParticleBackground.jsx
import { useEffect, useRef } from 'react';

// Pure canvas particle network — zero external dep, zero bundle cost.
// Green (#00C896) nodes connected by purple (#4F46E5) lines.
export default function ParticleBackground({ style = {} }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animId;
    let W, H;
    let particles = [];

    const PARTICLE_COUNT = 55;
    const MAX_DIST = 140;
    const NODE_COLOR = 'rgba(0,200,150,';
    const LINE_COLOR = 'rgba(79,70,229,';

    const resize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };

    const rand = (min, max) => Math.random() * (max - min) + min;

    const init = () => {
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: rand(0, W),
        y: rand(0, H),
        vx: rand(-0.35, 0.35),
        vy: rand(-0.35, 0.35),
        r: rand(2, 4.5),
        opacity: rand(0.4, 0.9),
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p = particles[i], q = particles[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.18;
            ctx.beginPath();
            ctx.strokeStyle = `${LINE_COLOR}${alpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${NODE_COLOR}${p.opacity})`;
        ctx.fill();

        // Glow ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `${NODE_COLOR}${(p.opacity * 0.1).toFixed(3)})`;
        ctx.fill();

        // Move
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }

      animId = requestAnimationFrame(draw);
    };

    resize();
    init();
    draw();

    const ro = new ResizeObserver(() => { resize(); init(); });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
