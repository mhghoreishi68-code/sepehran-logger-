import { useProgress } from '../animation/progressStore';

/** Elegant title card, fades out as soon as the user starts scrolling. */
export default function IntroOverlay() {
  const progress = useProgress();
  const opacity = Math.max(0, 1 - progress / 0.06);
  if (opacity <= 0.01) return null;

  return (
    <div className="ro-intro" style={{ opacity }}>
      <div className="ro-intro__eyebrow">SEPEHR PROCESS DEVELOPMENT ENGINEERING</div>
      <h1 className="ro-intro__title">
        ENGINEERING WATER PURITY
        <span className="ro-intro__title-sub">REVERSE OSMOSIS</span>
      </h1>
      <div className="ro-intro__hint">
        <span className="ro-intro__hint-line" />
        SCROLL TO EXPLORE
      </div>
    </div>
  );
}
