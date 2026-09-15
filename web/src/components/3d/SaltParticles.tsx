import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../../animation/constants';
import {
  FLOW_OUTER_RADIUS,
  FLOW_REJECT_END,
  FLOW_STACK_START,
  laneVisibility,
  makeSeeds,
  outerLaneRadius,
  outerLaneX,
} from '../../animation/FlowAnimation';
import { getProgress } from '../../animation/progressStore';
import { scaleCount } from '../../animation/qualityStore';
import { getParticleTexture } from './particleTexture';

const SPEED = 0.24;

/**
 * Conceptual dissolved-solids visualisation: small particles that travel
 * with the feed water but are rejected by the membrane, so -- unlike the
 * permeate lane -- they never migrate toward the central tube and instead
 * concentrate in the reject stream. Illustrative only, not a molecular
 * simulation.
 */
export default function SaltParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const COUNT = useMemo(() => scaleCount(140, 32), []);
  const seeds = useMemo(() => makeSeeds(COUNT, 97), [COUNT]);
  const clock = useRef(0);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    return geo;
  }, [COUNT]);

  useFrame((_, delta) => {
    clock.current += delta;
    const p = getProgress();
    const visibility = laneVisibility(p, 0.58, 0.7);
    if (materialRef.current) materialRef.current.opacity = visibility * 0.9;
    if (pointsRef.current) pointsRef.current.visible = visibility > 0.01;
    if (visibility <= 0.01) return;

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const s = (seeds.u0[i] + clock.current * SPEED) % 1;
      const x = outerLaneX(s, FLOW_STACK_START, FLOW_REJECT_END);
      // Salt rides slightly further out than bulk concentrate flow, drifting
      // outward as it travels -- a visual cue of "concentrating" toward reject.
      const radius = outerLaneRadius(FLOW_OUTER_RADIUS * (1.02 + s * 0.1), seeds.radiusJitter[i]);
      const angle = seeds.angle[i] + clock.current * 0.09;
      arr[i * 3] = x;
      arr[i * 3 + 1] = Math.cos(angle) * radius;
      arr[i * 3 + 2] = Math.sin(angle) * radius;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={materialRef}
        color={COLORS.salt}
        size={0.045}
        map={getParticleTexture()}
        transparent
        depthWrite={false}
        sizeAttenuation
        opacity={0}
      />
    </points>
  );
}
