export default function Footer() {
  return (
    <footer
      style={{
        padding: '20px 32px',
        borderTop: '1px solid var(--hairline)',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span className="caption">
        LifeShield AI — evidence layer, NVIDIA runtime, decision gates, and human-approved outputs, per the pptx architecture.
      </span>
      <span className="caption">Illustrative synthetic scenario — not a prediction about a real incident.</span>
    </footer>
  );
}
