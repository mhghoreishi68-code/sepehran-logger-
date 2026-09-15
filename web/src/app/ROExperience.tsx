import { useEffect, useRef, useState } from 'react';
import ROScene from '../components/3d/ROScene';
import IntroOverlay from '../ui/IntroOverlay';
import ScrollProgress from '../ui/ScrollProgress';
import EngineeringHUD from '../ui/EngineeringHUD';
import LoadingScreen from '../ui/LoadingScreen';
import DebugPanel from '../ui/DebugPanel';
import { createScrollTimeline } from '../animation/ROScrollTimeline';
import { setPointer, setManualOverrideActive, setProgress } from '../animation/progressStore';
import { detectQuality, getQuality, setQuality, type Quality } from '../animation/qualityStore';
import { isWebGLAvailable } from './webgl';

export interface ROExperienceProps {
  /** Render quality tier. Defaults to an auto-detected tier based on viewport/device. */
  quality?: Quality;
  /** Enables pointer parallax and debug/reset hotkeys. Defaults to true. */
  interactive?: boolean;
  /** Total scroll length driving the timeline, in viewport heights. */
  scrollLengthVh?: number;
}

/**
 * The embeddable RO scroll experience: a tall scroll spacer with a sticky
 * full-bleed 3D viewport inside it. Self-contained -- drop it into any page
 * section and it wires up its own scroll timeline, camera, particles and UI.
 */
export default function ROExperience({
  quality: qualityProp,
  interactive = true,
  scrollLengthVh = 800,
}: ROExperienceProps) {
  if (qualityProp) setQuality(qualityProp);
  else if (getQuality() === 'high') setQuality(detectQuality());

  const [webglOk] = useState(() => isWebGLAvailable());
  const [loading, setLoading] = useState(true);
  const [debugVisible, setDebugVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!webglOk || loading || !wrapperRef.current) return;
    const handle = createScrollTimeline(wrapperRef.current);
    return () => handle.destroy();
  }, [webglOk, loading]);

  useEffect(() => {
    if (!interactive) return;
    const onPointerMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      setPointer(x, y);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') setDebugVisible((v) => !v);
      if (e.key === 'r' || e.key === 'R') {
        setManualOverrideActive(false);
        setProgress(0);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [interactive]);

  if (!webglOk) {
    return (
      <div className="ro-webgl-fallback">
        <div>WebGL is required for this interactive engineering experience.</div>
      </div>
    );
  }

  return (
    <div className="ro-experience" ref={wrapperRef} style={{ height: `${scrollLengthVh}vh` }}>
      <div className="ro-experience__viewport">
        <ROScene quality={getQuality()} />
        {!loading && (
          <>
            <IntroOverlay />
            <ScrollProgress />
            <EngineeringHUD />
            {interactive && <DebugPanel visible={debugVisible} />}
          </>
        )}
      </div>
      {loading && <LoadingScreen onDone={() => setLoading(false)} />}
    </div>
  );
}
