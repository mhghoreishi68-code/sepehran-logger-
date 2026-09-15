import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  MEMBRANE_COUNT,
  MEMBRANE_ELEMENT_LENGTH,
  MEMBRANE_GAP,
  MEMBRANE_RADIUS,
  smoothstep,
  stageProgress,
} from '../../animation/constants';
import { evaluateMembraneReveal, membraneIndices } from '../../animation/VesselAnimation';
import { getProgress } from '../../animation/progressStore';
import MembraneElement from './MembraneElement';

const stride = MEMBRANE_ELEMENT_LENGTH + MEMBRANE_GAP;
const totalSpan = stride * MEMBRANE_COUNT - MEMBRANE_GAP;
const indices = membraneIndices();

export default function MembraneAssembly() {
  const revealRefs = useRef(indices.map(() => ({ current: 0 })));
  const explodeRef = useRef(0);

  useFrame(() => {
    const p = getProgress();
    indices.forEach((i) => {
      revealRefs.current[i].current = evaluateMembraneReveal(p, i);
    });
    const explodeIn = smoothstep(stageProgress(p, 0.5, 0.58));
    const explodeOut = 1 - smoothstep(stageProgress(p, 0.7, 0.78));
    explodeRef.current = explodeIn * explodeOut;
  });

  return (
    <group>
      {indices.map((i) => {
        const x = -totalSpan / 2 + i * stride + MEMBRANE_ELEMENT_LENGTH / 2;
        return (
          <MembraneElement
            key={i}
            position={[x, 0, 0]}
            length={MEMBRANE_ELEMENT_LENGTH}
            radius={MEMBRANE_RADIUS}
            revealRef={revealRefs.current[i]}
            explodeRef={i === 0 ? explodeRef : undefined}
          />
        );
      })}
    </group>
  );
}
