import { smoothstep, stageProgress } from '../animation/constants';
import { useProgress } from '../animation/progressStore';
import SectionLabel from './SectionLabel';

interface Stage {
  text: string;
  start: number;
  end: number;
}

const STAGES: Stage[] = [
  { text: 'CAMERA APPROACH', start: 0.09, end: 0.19 },
  { text: 'PRESSURE VESSEL — ROTATING VIEW', start: 0.19, end: 0.28 },
  { text: 'CUTAWAY — INTERNAL ACCESS', start: 0.28, end: 0.39 },
  { text: 'MEMBRANE ELEMENTS', start: 0.39, end: 0.49 },
  { text: 'FEED WATER ENTRY', start: 0.49, end: 0.58 },
  { text: 'FLOW THROUGH MEMBRANE CHANNELS', start: 0.58, end: 0.68 },
  { text: 'PERMEATE SEPARATION', start: 0.68, end: 0.78 },
  { text: 'CONCENTRATE / REJECT STREAM', start: 0.78, end: 0.88 },
  { text: 'SYSTEM OVERVIEW', start: 0.88, end: 0.97 },
  { text: 'ENGINEERED WATER PURITY', start: 0.97, end: 1.001 },
];

function stageOpacity(p: number, stage: Stage): number {
  const margin = 0.02;
  const fadeIn = smoothstep(stageProgress(p, stage.start, Math.min(stage.end, stage.start + margin)));
  const fadeOut = 1 - smoothstep(stageProgress(p, stage.end - margin, stage.end));
  return fadeIn * fadeOut;
}

export default function EngineeringHUD() {
  const progress = useProgress();
  if (progress < 0.06) return null;

  return (
    <div className="ro-hud">
      <div className="ro-hud__corner ro-hud__corner--top-left">
        <div className="ro-hud__brand">REVERSE OSMOSIS</div>
        <div className="ro-hud__brand-sub">MEMBRANE SEPARATION</div>
      </div>

      <div className="ro-hud__stage">
        {STAGES.map((stage) => (
          <SectionLabel key={stage.text} text={stage.text} opacity={stageOpacity(progress, stage)} />
        ))}
      </div>

      <div className="ro-hud__corner ro-hud__corner--bottom-left">
        <div className="ro-hud__note">CONCEPTUAL PROCESS VISUALISATION — NOT TO SCALE</div>
      </div>
    </div>
  );
}
