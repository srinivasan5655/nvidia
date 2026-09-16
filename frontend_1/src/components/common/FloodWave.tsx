/** A drifting water-line flourish — two overlapping SVG wave paths sliding
 * past each other, tinted by severity. Purely decorative (aria-hidden,
 * pointer-events-none); meant as a bottom-of-card accent, not a data
 * visualization — the real numbers live in the text next to it. */
export function FloodWave({
  height = 28,
  tone = "primary",
  className = "",
}: {
  height?: number;
  tone?: "primary" | "warning" | "critical";
  className?: string;
}) {
  const color = { primary: "#76b900", warning: "#fab219", critical: "#ff6b6b" }[tone];
  return (
    <div aria-hidden className={`pointer-events-none relative overflow-hidden ${className}`} style={{ height }}>
      <svg
        className="animate-wave-drift absolute inset-y-0 left-0"
        width="200%"
        height="100%"
        viewBox="0 0 400 28"
        preserveAspectRatio="none"
      >
        <path
          d="M0 14 Q 25 2, 50 14 T 100 14 T 150 14 T 200 14 T 250 14 T 300 14 T 350 14 T 400 14 V28 H0 Z"
          fill={color}
          opacity="0.16"
        />
        <path
          d="M0 18 Q 25 8, 50 18 T 100 18 T 150 18 T 200 18 T 250 18 T 300 18 T 350 18 T 400 18 V28 H0 Z"
          fill={color}
          opacity="0.28"
        />
      </svg>
    </div>
  );
}
