// frontend/src/components/StatCard.jsx
// IntersectionObserver-powered countUp stat card
import { useEffect, useRef, useState } from 'react';

export default function StatCard({ value, suffix = '', label, delay = 0 }) {
  const [displayed, setDisplayed] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);

  // Parse numeric portion
  const numericValue = parseFloat(String(value).replace(/[^0-9.]/g, ''));
  const prefix = String(value).match(/^[^0-9]*/)?.[0] || '';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let frame;
    const DURATION = 1600;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start - delay * 1000;
      if (elapsed < 0) { frame = requestAnimationFrame(tick); return; }
      const progress = Math.min(elapsed / DURATION, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayed(numericValue * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, numericValue, delay]);

  const formatted = () => {
    if (numericValue >= 100) return Math.round(displayed).toLocaleString();
    return displayed.toFixed(1);
  };

  return (
    <div ref={ref} className="lab-card stat-card animate-fade-up">
      <div className="stat-num">
        {prefix}{formatted()}{suffix}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
