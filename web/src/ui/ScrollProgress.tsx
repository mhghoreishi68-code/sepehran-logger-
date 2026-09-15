import { useProgress } from '../animation/progressStore';

/** A very thin progress rail along the right edge -- present, not decorative. */
export default function ScrollProgress() {
  const progress = useProgress();
  return (
    <div className="ro-scrollbar" aria-hidden>
      <div className="ro-scrollbar__track">
        <div className="ro-scrollbar__fill" style={{ height: `${progress * 100}%` }} />
      </div>
      <div className="ro-scrollbar__value">{String(Math.round(progress * 100)).padStart(2, '0')}%</div>
    </div>
  );
}
