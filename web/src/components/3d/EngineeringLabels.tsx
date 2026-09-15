import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { smoothstep, stageProgress } from '../../animation/constants';
import { getProgress } from '../../animation/progressStore';
import { FLOW_FEED_START, FLOW_REJECT_END, FLOW_PERMEATE_EXIT_X } from '../../animation/FlowAnimation';

interface LabelDef {
  text: string;
  position: [number, number, number];
  start: number;
  end: number;
  fadeOutStart: number;
  fadeOutEnd: number;
}

const LABELS: LabelDef[] = [
  { text: 'PRESSURE VESSEL', position: [0, 1.9, 0], start: 0.02, end: 0.1, fadeOutStart: 0.28, fadeOutEnd: 0.34 },
  { text: 'FEED', position: [FLOW_FEED_START + 0.6, 0.5, 0], start: 0.45, end: 0.52, fadeOutStart: 0.58, fadeOutEnd: 0.63 },
  { text: 'MEMBRANE ELEMENT', position: [-3.9, 1.0, 0], start: 0.4, end: 0.47, fadeOutStart: 0.6, fadeOutEnd: 0.66 },
  { text: 'PERMEATE', position: [0.2, -0.35, 0.5], start: 0.66, end: 0.72, fadeOutStart: 0.86, fadeOutEnd: 0.9 },
  { text: 'CONCENTRATE / REJECT', position: [FLOW_REJECT_END - 0.9, 0.6, 0], start: 0.76, end: 0.82, fadeOutStart: 0.87, fadeOutEnd: 0.91 },
  { text: 'PERMEATE OUTLET', position: [FLOW_PERMEATE_EXIT_X, -1.6, 0], start: 0.78, end: 0.83, fadeOutStart: 0.87, fadeOutEnd: 0.91 },
];

export default function EngineeringLabels() {
  return (
    <>
      {LABELS.map((label) => (
        <Label key={label.text} def={label} />
      ))}
    </>
  );
}

function Label({ def }: { def: LabelDef }) {
  const ref = useRef<HTMLDivElement>(null);

  useFrame(() => {
    const p = getProgress();
    const fadeIn = smoothstep(stageProgress(p, def.start, def.end));
    const fadeOut = 1 - smoothstep(stageProgress(p, def.fadeOutStart, def.fadeOutEnd));
    const opacity = fadeIn * fadeOut;
    if (ref.current) {
      ref.current.style.opacity = String(opacity);
      ref.current.style.pointerEvents = 'none';
    }
  });

  return (
    <Html position={def.position} center distanceFactor={8} zIndexRange={[10, 0]} occlude={false}>
      <div ref={ref} className="ro-label" style={{ opacity: 0 }}>
        <span className="ro-label__dash" />
        {def.text}
      </div>
    </Html>
  );
}
