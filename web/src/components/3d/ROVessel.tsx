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
  const domeMatRefs = useRef<THREE.MeshStandardMaterial[]>([]);

  // Fixed clip direction, tilted slightly toward +Z for a more dynamic cut
  // line than a perfectly horizontal one. Per the three.js clipping-plane
  // contract, a fragment at world point P is DISCARDED when
  // `normal.dot(P) + constant > 0` -- i.e. everything on the +normal side of
  // the plane `normal.dot(P) = threshold` is removed once constant = -threshold.
  const clipNormal = useMemo(() => new THREE.Vector3(0, 1, 0.18).normalize(), []);
  const clipPlane = useMemo(() => new THREE.Plane(clipNormal.clone(), -(VESSEL_RADIUS + 0.6)), [clipNormal]);

  useFrame(() => {
    const p = getProgress();
    const state = evaluateVesselState(p);
    if (groupRef.current) groupRef.current.rotation.x = state.rotationY;

    // threshold = how far along +normal the cut sits. Closed: threshold is
    // pushed well outside the shell radius so nothing is discarded. Open:
    // threshold drops to just below the vessel's central axis, so the
    // entire upper wedge -- the side every interior camera keyframe
    // approaches from -- is removed and the camera always looks through
    // the opening, never at the still-solid remainder of the shell.
    const openT = THREE.MathUtils.clamp(state.cutawayAngle / (Math.PI * 1.35), 0, 1);
    const threshold = THREE.MathUtils.lerp(VESSEL_RADIUS + 0.6, -0.05, openT);
    clipPlane.constant = -threshold;

    if (shellMatRef.current) {
      shellMatRef.current.opacity = state.shellOpacity;
      shellMatRef.current.clippingPlanes = [clipPlane];
    }
    // The domed heads must clip in sync with the shell -- otherwise they
    // stay permanently solid and can physically block the camera's view of
    // the membrane elements near the vessel ends once the shell "opens".
    domeMatRefs.current.forEach((m) => {
      if (!m) return;
      m.opacity = state.shellOpacity;
      m.clippingPlanes = [clipPlane];
    });
  });

  const shellLength = VESSEL_LENGTH - VESSEL_HEAD_LENGTH * 0.3;
  const shellSegments = useMemo(() => scaleCount(64, 24), []);
  const capSegments = useMemo(() => scaleCount(48, 18), []);

  return (
    <group ref={groupRef}>
      {/* Main cylindrical shell. depthWrite is off (same reasoning as the
          membrane layers): a transparent material still writes depth by
          default, and even a sliver of un-clipped shell near the cutaway
          edge was enough to block the whole interior view behind it. */}
      <mesh rotation={[0, 0, Math.PI / 2]} renderOrder={-1} castShadow receiveShadow>
        <cylinderGeometry args={[VESSEL_RADIUS, VESSEL_RADIUS, shellLength, shellSegments, 1, true]} />
        <meshStandardMaterial
          ref={shellMatRef}
          color={COLORS.vesselMetal}
          metalness={0.55}
          roughness={0.38}
          envMapIntensity={1.4}
          side={THREE.DoubleSide}
          transparent
          depthWrite={false}
          clippingPlanes={[clipPlane]}
          clipShadows
        />
      </mesh>

      {/* Rounded heads (domed end caps) */}
      {[-1, 1].map((dir, i) => (
        <mesh
          key={dir}
          position={[dir * (shellLength / 2), 0, 0]}
          rotation={[0, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2]}
          renderOrder={-1}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[VESSEL_RADIUS, capSegments, capSegments / 2, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial
            ref={(m) => {
              if (m) domeMatRefs.current[i] = m;
            }}
            color={COLORS.vesselMetalDark}
            metalness={0.5}
            roughness={0.42}
            envMapIntensity={1.4}
            transparent
            depthWrite={false}
            clipShadows
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
