interface SectionLabelProps {
  text: string;
  opacity: number;
  variant?: 'default' | 'large';
}

/** A single technical stage label, positioned by its parent, fading via opacity. */
export default function SectionLabel({ text, opacity, variant = 'default' }: SectionLabelProps) {
  if (opacity <= 0.01) return null;
  return (
    <div
      className={variant === 'large' ? 'ro-section-label ro-section-label--large' : 'ro-section-label'}
      style={{ opacity, position: 'absolute', inset: 0 }}
    >
      {text}
    </div>
  );
}
