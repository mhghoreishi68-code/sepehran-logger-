import { useEffect, useState } from 'react';
import {
  getProgress,
  isManualOverrideActive,
  setManualOverrideActive,
  setProgress,
} from '../animation/progressStore';
import { evaluateVesselState } from '../animation/VesselAnimation';

interface DebugPanelProps {
  visible: boolean;
}

/** Developer-only inspector (toggle with the D key). Never shown in normal presentation mode. */
export default function DebugPanel({ visible }: DebugPanelProps) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const loop = () => {
      forceTick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  const p = getProgress();
  const vessel = evaluateVesselState(p);
  const override = isManualOverrideActive();

  return (
    <div className="ro-debug">
      <div className="ro-debug__title">DEBUG</div>

      <label className="ro-debug__row">
        <span>scroll progress</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={p}
          onChange={(e) => {
            setManualOverrideActive(true);
            setProgress(Number(e.target.value));
          }}
        />
        <span>{(p * 100).toFixed(1)}%</span>
      </label>

      <button
        type="button"
        className="ro-debug__button"
        onClick={() => setManualOverrideActive(!override)}
      >
        {override ? 'RESUME SCROLL SYNC' : 'OVERRIDE PROGRESS'}
      </button>

      <div className="ro-debug__row ro-debug__row--static">
        <span>cutaway angle</span>
        <span>{vessel.cutawayAngle.toFixed(2)} rad</span>
      </div>
      <div className="ro-debug__row ro-debug__row--static">
        <span>vessel rotation</span>
        <span>{vessel.rotationY.toFixed(2)} rad</span>
      </div>
      <div className="ro-debug__row ro-debug__row--static">
        <span>shell opacity</span>
        <span>{vessel.shellOpacity.toFixed(2)}</span>
      </div>
      <div className="ro-debug__hint">D toggle · R reset to start</div>
    </div>
  );
}
