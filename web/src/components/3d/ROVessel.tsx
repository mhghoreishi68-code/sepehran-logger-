import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS, VESSEL_HEAD_LENGTH, VESSEL_LENGTH, VESSEL_RADIUS } from '../../animation/constants';
import { evaluateVesselState } from '../../animation/VesselAnimation';
import { getProgress } from '../../animation/progressStore';
import { scaleCount } from '../../animation/qualityStore';

/**
 * The pressure vessel shell + rounded heads + nozzles. Cutaway is achieved
 * with a single clipping plane rotating around the vessel's long axis:
 * closed (angle 0) shows the whole shell; opened reveals the interior while
 * the remaining shell material stays crisp, like a real engineering cutaway.
 */
export default function ROVessel() {
  const groupRef = useRef<THREE.Group>(null);
  const shellMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const capMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), VESSEL_RADIUS + 0.5), []);

  useFrame(() => {
    const p = getProgress();
    const state = evaluateVesselState(p);
    if (groupRef.current) groupRef.current.rotation.x = state.rotationY;

    // Rotate the clip plane's normal around X to "open" the shell like a
    // hinged cutaway, and pull its offset in from clear-of-geometry toward
    // the axis as cutawayAngle increases. The open (clipped-away) wedge
    // faces +Y / +Z -- the side every interior camera keyframe approaches
    // from -- so the camera always looks through the opening, never at the
    // still-solid remainder of the shell.
    const openT = THREE.MathUtils.clamp(state.cutawayAngle / (Math.PI * 1.35), 0, 1);
    const hingeAngle = THREE.MathUtils.degToRad(-18) - openT * THREE.MathUtils.degToRad(150);
    const normal = new THREE.Vector3(0, Math.cos(hingeAngle), Math.sin(hingeAngle));
    clipPlane.normal.copy(normal).negate();
    clipPlane.constant = THREE.MathUtils.lerp(VESSEL_RADIUS + 0.6, -0.02, openT);

    if (shellMatRef.current) {
      shellMatRef.current.opacity = state.shellOpacity;
      shellMatRef.current.clippingPlanes = [clipPlane];
    }
    if (capMatRef.current) {
      capMatRef.current.opacity = state.shellOpacity;
    }
  });

  const shellLength = VESSEL_LENGTH - VESSEL_HEAD_LENGTH * 0.3;
  const shellSegments = useMemo(() => scaleCount(64, 24), []);
  const capSegments = useMemo(() => scaleCount(48, 18), []);

  return (
    <group ref={groupRef}>
      {/* Main cylindrical shell */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[VESSEL_RADIUS, VESSEL_RADIUS, shellLength, shellSegments, 1, true]} />
        <meshStandardMaterial
          ref={shellMatRef}
          color={COLORS.vesselMetal}
          metalness={0.55}
          roughness={0.38}
          envMapIntensity={1.4}
          side={THREE.DoubleSide}
          transparent
          clippingPlanes={[clipPlane]}
          clipShadows
        />
      </mesh>

      {/* Rounded heads (domed end caps) */}
      {[-1, 1].map((dir) => (
        <mesh
          key={dir}
          position={[dir * (shellLength / 2), 0, 0]}
          rotation={[0, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[VESSEL_RADIUS, capSegments, capSegments / 2, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial
            ref={dir === 1 ? capMatRef : undefined}
            color={COLORS.vesselMetalDark}
            metalness={0.5}
            roughness={0.42}
            envMapIntensity={1.4}
            transparent
          />
        </mesh>
      ))}

      {/* Feed inlet nozzle */}
      <Nozzle position={[-(shellLength / 2 + 0.55), -VESSEL_RADIUS * 0.15, 0]} rotation={[0, 0, Math.PI / 2]} />
      {/* Concentrate outlet nozzle */}
      <Nozzle position={[shellLength / 2 + 0.55, -VESSEL_RADIUS * 0.15, 0]} rotation={[0, 0, -Math.PI / 2]} />
      {/* Permeate outlet nozzle (bottom, near product end) */}
      <Nozzle
        position={[shellLength / 2 - 0.65, -(VESSEL_RADIUS + 0.55), 0]}
        rotation={[Math.PI / 2, 0, 0]}
        length={0.7}
        radius={0.14}
      />

      {/* Support saddles for an engineered, grounded look */}
      {[-2.6, 2.6].map((x) => (
        <mesh key={x} position={[x, -VESSEL_RADIUS - 0.55, 0]} receiveShadow>
          <boxGeometry args={[0.5, 1.1, VESSEL_RADIUS * 1.7]} />
          <meshStandardMaterial color={COLORS.vesselMetalDark} metalness={0.6} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Nozzle({
  position,
  rotation,
  length = 0.9,
  radius = 0.22,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  length?: number;
  radius?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <cylinderGeometry args={[radius, radius, length, 24]} />
      <meshStandardMaterial color={COLORS.vesselMetal} metalness={0.9} roughness={0.3} />
    </mesh>
  );
}
