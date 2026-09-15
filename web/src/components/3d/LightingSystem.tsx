import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS, lerp, smoothstep, stageProgress } from '../../animation/constants';
import { getProgress } from '../../animation/progressStore';

/**
 * Subtle lighting choreography: soft exterior studio light for the hero
 * shots, a slightly brighter interior rim once the cutaway opens, focused
 * key light during the membrane close-up, and a balanced hero setup again
 * at the very end.
 */
export default function LightingSystem() {
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);
  const interiorRef = useRef<THREE.PointLight>(null);
  const fillRef = useRef<THREE.AmbientLight>(null);

  useFrame(() => {
    const p = getProgress();
    const interior = smoothstep(stageProgress(p, 0.32, 0.5));
    const closeUp = smoothstep(stageProgress(p, 0.52, 0.6)) * (1 - smoothstep(stageProgress(p, 0.72, 0.8)));

    if (keyRef.current) {
      keyRef.current.intensity = lerp(3.4, 2.6, interior * 0.4);
    }
    if (rimRef.current) {
      rimRef.current.intensity = lerp(10, 20, interior);
    }
    if (interiorRef.current) {
      interiorRef.current.intensity = lerp(2, 14, interior) + closeUp * 10;
      interiorRef.current.position.x = lerp(-2, 0.5, stageProgress(p, 0.4, 0.85));
    }
    if (fillRef.current) {
      fillRef.current.intensity = lerp(0.6, 0.85, interior);
    }
  });

  return (
    <>
      <ambientLight ref={fillRef} intensity={0.6} color="#9fb4c4" />
      <directionalLight
        ref={keyRef}
        position={[6, 8, 6]}
        intensity={3.4}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-5, 3, -6]} intensity={1.2} color={COLORS.rimLight} />
      <pointLight ref={rimRef} position={[-6, 2, -4]} intensity={10} color={COLORS.rimLight} distance={22} />
      <pointLight ref={interiorRef} position={[-2, 0.5, 0]} intensity={2} color={COLORS.accent} distance={9} />
      <hemisphereLight args={[COLORS.rimLight, COLORS.backgroundDeep, 0.5]} />
    </>
  );
}
