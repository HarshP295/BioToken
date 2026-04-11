// frontend/src/components/HplcWave.jsx
// SVG HPLC chromatogram waveform with CSS draw-on animation
export default function HplcWave({ className = '', style = {} }) {
  const peaks = [
    'M 0 80 C 30 80, 35 80, 40 80 C 45 80, 48 78, 50 55 C 52 32, 55 20, 60 10 C 65 0, 70 0, 75 15 C 80 30, 82 55, 85 78 C 88 80, 90 80, 100 80',
    'M 100 80 C 110 80, 115 80, 120 80 C 125 80, 127 76, 130 65 C 133 54, 136 45, 140 35 C 144 25, 148 22, 152 30 C 156 38, 158 55, 162 75 C 164 80, 167 80, 180 80',
    'M 180 80 C 195 80, 200 80, 210 80 C 218 80, 222 72, 226 50 C 230 28, 234 5, 240 2 C 246 -1, 250 5, 254 28 C 258 51, 262 72, 268 80 C 274 80, 280 80, 300 80',
    'M 300 80 C 310 80, 315 79, 320 75 C 325 71, 328 62, 332 55 C 336 48, 340 44, 344 50 C 348 56, 350 65, 354 75 C 358 80, 362 80, 380 80',
    'M 380 80 C 390 80, 395 79, 400 74 C 405 69, 408 58, 412 46 C 416 34, 420 28, 424 33 C 428 38, 430 52, 434 68 C 437 78, 440 80, 460 80',
    'M 460 80 C 470 80, 480 80, 500 80',
  ].join(' ');

  return (
    <svg
      viewBox="0 0 500 90"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: 'visible', ...style }}
      aria-label="HPLC chromatogram fingerprint"
    >
      <defs>
        <linearGradient id="hplc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00C896" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#4F46E5" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00C896" stopOpacity="0.3" />
        </linearGradient>
        <filter id="hplc-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Baseline */}
      <line
        x1="0" y1="80" x2="500" y2="80"
        stroke="#E5E3DF" strokeWidth="1"
      />

      {/* Axis labels */}
      <text x="0" y="88" fontSize="6" fill="#9CA3AF" fontFamily="IBM Plex Mono">0 min</text>
      <text x="230" y="88" fontSize="6" fill="#9CA3AF" fontFamily="IBM Plex Mono">12.5 min</text>
      <text x="470" y="88" fontSize="6" fill="#9CA3AF" fontFamily="IBM Plex Mono">25 min</text>

      {/* Glow layer */}
      <path
        d={peaks}
        fill="none"
        stroke="url(#hplc-grad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#hplc-glow)"
        opacity="0.4"
      />

      {/* Main waveform line */}
      <path
        d={peaks}
        fill="none"
        stroke="url(#hplc-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1000"
        strokeDashoffset="1000"
        style={{
          animation: 'drawLine 2.4s cubic-bezier(0.4,0,0.2,1) 0.3s forwards',
        }}
      />

      {/* Peak annotation dots */}
      {[
        { cx: 68, cy: 6,  label: 'RT 6.8' },
        { cx: 240, cy: 2, label: 'RT 12.2' },
        { cx: 422, cy: 28, label: 'RT 18.4' },
      ].map(({ cx, cy, label }) => (
        <g key={label} opacity="0" style={{ animation: `fadeIn 0.4s ease-out 2.5s forwards` }}>
          <circle cx={cx} cy={cy} r="3" fill="#00C896" />
          <line x1={cx} y1={cy + 3} x2={cx} y2="78" stroke="#00C896" strokeWidth="0.5" strokeDasharray="2 2" />
          <text x={cx + 4} y={cy - 2} fontSize="5" fill="#00C896" fontFamily="IBM Plex Mono" fontWeight="600">{label}</text>
        </g>
      ))}
    </svg>
  );
}
