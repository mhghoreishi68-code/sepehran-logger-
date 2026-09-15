import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  onDone: () => void;
}

/** Elegant loading card while the WebGL scene spins up. */
export default function LoadingScreen({ onDone }: LoadingScreenProps) {
  const [pct, setPct] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let raf = 0;
    const started = performance.now();
    const duration = 1100;
    const tick = () => {
      const t = Math.min(1, (performance.now() - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setPct(Math.round(eased * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setHidden(true);
        setTimeout(onDone, 420);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  return (
    <div className={`ro-loading ${hidden ? 'ro-loading--hidden' : ''}`}>
      <div className="ro-loading__mark">SEPEHR PROCESS</div>
      <div className="ro-loading__sub">INITIALISING 3D ENGINE</div>
      <div className="ro-loading__bar">
        <div className="ro-loading__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="ro-loading__pct">{pct}%</div>
    </div>
  );
}
