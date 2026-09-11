import { useRef } from 'react';

// Wraps its children (normally a single .card) with a real perspective/
// rotateX/rotateY 3D tilt that tracks the pointer, plus a soft radial glow
// that follows the cursor. Pure CSS-variable driven (--rx/--ry/--gx/--gy)
// so it stays perfectly smooth without re-rendering React on every
// mousemove. Falls back to inert on touch devices (no mousemove there).
export default function TiltCard({ children, className = '', maxTilt = 10, style }) {
  const ref = useRef(null);

  function onMouseMove(e) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height; // 0..1
    const rx = (px - 0.5) * maxTilt * 2;
    const ry = -(py - 0.5) * maxTilt * 2;
    el.style.setProperty('--rx', `${rx}deg`);
    el.style.setProperty('--ry', `${ry}deg`);
    el.style.setProperty('--gx', `${px * 100}%`);
    el.style.setProperty('--gy', `${py * 100}%`);
    el.style.setProperty('--tz', '10px');
  }

  function onMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--tz', '0px');
  }

  return (
    <div
      ref={ref}
      className={`tilt-card ${className}`}
      style={style}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {children}
      <div className="tilt-glow" />
    </div>
  );
}
