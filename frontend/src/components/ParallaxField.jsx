import { useEffect, useRef } from 'react';

// Fixed, full-viewport 3D parallax backdrop. Three blurred glow orbs drift
// slowly on their own (pure CSS keyframes, see index.css), and additionally
// shift in response to pointer position via the --mx/--my custom properties
// set here on rAF-throttled mousemove -- this is the "3D parallax" layer
// used behind every screen in the app.
export default function ParallaxField() {
  const ref = useRef(null);
  const raf = useRef(null);
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function onMove(e) {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      target.current.x = (e.clientX / w - 0.5) * 60;
      target.current.y = (e.clientY / h - 0.5) * 60;
      if (raf.current == null) {
        raf.current = requestAnimationFrame(apply);
      }
    }
    function apply() {
      raf.current = null;
      const el = ref.current;
      if (!el) return;
      el.style.setProperty('--mx', `${target.current.x}px`);
      el.style.setProperty('--my', `${target.current.y}px`);
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div className="parallax-field" ref={ref} aria-hidden="true">
      <div className="parallax-orb parallax-orb--1" />
      <div className="parallax-orb parallax-orb--2" />
      <div className="parallax-orb parallax-orb--3" />
    </div>
  );
}
