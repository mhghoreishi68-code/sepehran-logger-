import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS, MEMBRANE_TUBE_RADIUS } from '../../animation/constants';

interface MembraneElementProps {
  position: [number, number, number];
  length: number;
  radius: number;
  /** Ref to the live 0..1 stagger-reveal factor (scale + opacity), updated externally each frame. */
  revealRef: React.MutableRefObject<number>;
  /** Ref to a 0..1 factor that fades the outer shell to expose internal layers (close-up stage). */
  explodeRef?: React.MutableRefObject<number>;
}

/**
 * Procedural approximation of a spiral-wound RO membrane element: an outer
 * polymeric shell with a wound-line pattern, an inner feed-spacer channel,
 * and a protruding central permeate tube -- enough visual information to
 * read clearly as "membrane cartridge", not a generic cylinder.
 */
export default function MembraneElement({ position, length, radius, revealRef, explodeRef }: MembraneElementProps) {
  const groupRef = useRef<THREE.Group>(null);
  const shellMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const spacerMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const woundMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const tubeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const capMatRefs = useRef<THREE.MeshStandardMaterial[]>([]);

  const woundGeometry = useMemo(() => {
    const wraps = 5.5;
    const points: THREE.Vector3[] = [];
    const segs = 220;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const theta = t * wraps * Math.PI * 2;
      const x = (t - 0.5) * length * 0.94;
      const y = Math.cos(theta) * radius * 1.001;
      const z = Math.sin(theta) * radius * 1.001;
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, 260, 0.012, 6, false);
  }, [length, radius]);

  useFrame(() => {
    const reveal = revealRef.current;
    const explode = explodeRef?.current ?? 0;

    if (groupRef.current) {
      groupRef.current.visible = reveal > 0.001;
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(0.5, 1, reveal));
    }
    if (shellMatRef.current) shellMatRef.current.opacity = reveal * (1 - explode * 0.5);
    if (woundMatRef.current) woundMatRef.current.opacity = reveal * (0.55 + explode * 0.25);
    if (spacerMatRef.current) spacerMatRef.current.opacity = reveal * explode * 0.55;
    if (tubeMatRef.current) tubeMatRef.current.opacity = reveal;
    capMatRefs.current.forEach((m) => {
      if (m) m.opacity = reveal;
    });
  });

  const tubeStub = 0.14;

  return (
    <group ref={groupRef} position={position}>
      {/* Outer membrane shell. depthWrite is off so it never occludes the
          layers nested inside it -- transparent materials write depth by
          default in three.js, which would otherwise hide the spacer/tube
          even at low opacity. renderOrder keeps the outside-in stacking
          deterministic regardless of per-frame distance sorting. */}
      <mesh rotation={[0, 0, Math.PI / 2]} renderOrder={0}>
        <cylinderGeometry args={[radius, radius, length, 48, 1, true]} />
        <meshStandardMaterial
          ref={shellMatRef}
          color={COLORS.membraneBody}
          roughness={0.75}
          metalness={0.05}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Wound-line surface pattern suggesting the spiral leaf structure */}
      <mesh geometry={woundGeometry} renderOrder={1}>
        <meshStandardMaterial ref={woundMatRef} color={COLORS.vesselMetalDark} roughness={0.6} transparent depthWrite={false} />
      </mesh>

      {/* Inner feed-spacer channel (visible as shell fades in close-up) */}
      <mesh rotation={[0, 0, Math.PI / 2]} renderOrder={2}>
        <cylinderGeometry args={[radius * 0.7, radius * 0.7, length * 0.98, 32, 1, true]} />
        <meshStandardMaterial
          ref={spacerMatRef}
          color={COLORS.accent}
          roughness={0.4}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          emissive={COLORS.accentDim}
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Central permeate tube, protruding slightly beyond the element for a connected-cartridge look */}
      <mesh rotation={[0, 0, Math.PI / 2]} renderOrder={4}>
        <cylinderGeometry args={[MEMBRANE_TUBE_RADIUS, MEMBRANE_TUBE_RADIUS, length + tubeStub * 2, 20]} />
        <meshStandardMaterial ref={tubeMatRef} color={COLORS.membraneTube} metalness={0.7} roughness={0.3} transparent />
      </mesh>

      {/* End caps (anti-telescoping discs) */}
      {[-1, 1].map((dir, i) => (
        <mesh key={dir} position={[(dir * length) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} renderOrder={3}>
          <ringGeometry args={[MEMBRANE_TUBE_RADIUS * 1.3, radius * 0.98, 32]} />
          <meshStandardMaterial
            ref={(m) => {
              if (m) capMatRefs.current[i] = m;
            }}
            color={COLORS.vesselMetalDark}
            roughness={0.7}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
