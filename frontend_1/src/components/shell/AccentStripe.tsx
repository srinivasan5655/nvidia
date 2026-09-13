/** A soft horizontal glow instead of a hard-edged brand bar — marks the top
 * of the footer "chapter" without reading as a flat color swatch. */
export function AccentStripe() {
  return (
    <div className="h-px w-full shrink-0 bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
  );
}
