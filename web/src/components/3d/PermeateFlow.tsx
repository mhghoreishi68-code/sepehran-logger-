import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../../animation/constants';
import {
  FLOW_OUTER_RADIUS,
  FLOW_TUBE_RADIUS,
  laneVisibility,
  makeSeeds,
  permeateLaneSample,
} from '../../animation/FlowAnimation';
import { getProgress } from '../../animation/progressStore';
import { scaleCount } from '../../animation/qualityStore';
import { getParticleTexture } from './particleTexture';

const SPEED = 0.2;

/**
 * Permeate stream: the fraction of feed water that crosses the membrane
 * (visualised as a radial migration to the central tube) and exits along
 * the tube axis -- the core "separation" moment of the piece.
 */
export default function PermeateFlow() {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const COUNT = useMemo(() => scaleCount(220, 50), []);
  const seeds = useMemo(() => makeSeeds(COUNT, 41), [COUNT]);
  const clock = useRef(0);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    return geo;
  }, [COUNT]);

  useFrame((_, delta) => {
    clock.current += delta;
    const p = getProgress();
    const visibility = laneVisibility(p, 0.65, 0.75);
    if (materialRef.current) materialRef.current.opacity = visibility * 0.95;
    if (pointsRef.current) pointsRef.current.visible = visibility > 0.01;
    if (visibility <= 0.01) return;

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const s = (seeds.u0[i] + clock.current * SPEED) % 1;
      const { x, radiusT } = permeateLaneSample(s, seeds.crossPoint[i]);
      const radius = THREE.MathUtils.lerp(FLOW_OUTER_RADIUS * seeds.radiusJitter[i], FLOW_TUBE_RADIUS, radiusT);
      const angle = seeds.angle[i] + clock.current * 0.2;
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
        color={COLORS.permeate}
        size={0.06}
        map={getParticleTexture()}
        transparent
        depthWrite={false}
        sizeAttenuation
        opacity={0}
      />
    </points>
  );
}
