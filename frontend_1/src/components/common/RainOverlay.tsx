import { useMemo } from "react";

/** Purely decorative falling-rain flourish for the app's own subject matter
 * (a flood-response tool) — CSS-only streaks, no canvas, no JS animation
 * loop. Always `pointer-events-none` and `aria-hidden`, so it can never
 * intercept a click or confuse a screen reader; wrap it in a `relative
 * overflow-hidden` container and it fills that container only. Generated
 * once per mount via useMemo so streak positions don't jitter on re-render. */
export function RainOverlay({ density = 46, className = "" }: { density?: number; className?: string }) {
  const drops = useMemo(
    () =>
      Array.from({ length: density }, (_, i) => ({
        left: (i * 97 + (i % 7) * 13) % 100,
        duration: 0.9 + ((i * 37) % 100) / 70,
        delay: -((i * 53) % 100) / 40,
        height: 14 + ((i * 29) % 100) / 4,
        opacity: 0.08 + ((i * 17) % 100) / 400,
      })),
    [density],
  );

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {drops.map((d, i) => (
        <span
          key={i}
          className="animate-rain-fall absolute top-0 w-px bg-gradient-to-b from-transparent via-intel/70 to-transparent"
          style={{
            left: `${d.left}%`,
            height: `${d.height}%`,
            opacity: d.opacity,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
