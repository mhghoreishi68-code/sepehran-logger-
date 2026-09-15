import { Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS } from '../../animation/constants';
import { evaluateCameraPath } from '../../animation/CameraAnimation';
import { getParallaxFactor, getPointer, getProgress } from '../../animation/progressStore';
import ROVessel from './ROVessel';
import MembraneAssembly from './MembraneAssembly';
import WaterParticles from './WaterParticles';
import PermeateFlow from './PermeateFlow';
import ConcentrateFlow from './ConcentrateFlow';
import SaltParticles from './SaltParticles';
import EngineeringLabels from './EngineeringLabels';
import LightingSystem from './LightingSystem';

interface ROSceneProps {
  quality: 'high' | 'medium' | 'low';
}

function CameraRig() {
  const { camera } = useThree();
  const lookTarget = useRef(new THREE.Vector3());
  const desiredPos = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const p = getProgress();
    const pose = evaluateCameraPath(p);
    const pointer = getPointer();
    const parallax = getParallaxFactor();

    desiredPos.current.copy(pose.position);
    // Subtle mouse parallax layered on top of the scroll-driven path, only
    // while the user is idle so it never fights the scroll-scrubbed camera.
    desiredPos.current.x += pointer.x * 0.25 * parallax;
    desiredPos.current.y += pointer.y * 0.15 * parallax;

    // Frame-rate-independent damping: convergence depends on elapsed time,
    // not on how many frames happened to render, so the cinematic follow
    // feels the same at 30fps, 60fps or a throttled/background tab.
    // A dev-only instant-snap escape hatch (window.__ro_debug_snap) lets
    // automated visual tests jump straight to the exact keyframe pose.
    const snap = import.meta.env.DEV && (window as any).__ro_debug_snap;
    const dt = Math.min(delta, 0.1);
    const posFactor = snap ? 1 : 1 - Math.exp(-6 * dt);
    const fovFactor = snap ? 1 : 1 - Math.exp(-5 * dt);

    camera.position.lerp(desiredPos.current, posFactor);
    lookTarget.current.lerp(pose.target, posFactor);
    camera.lookAt(lookTarget.current);

    const cam = camera as THREE.PerspectiveCamera;
    if (cam.fov !== undefined) {
      cam.fov = THREE.MathUtils.lerp(cam.fov, pose.fov, fovFactor);
      cam.updateProjectionMatrix();
    }
  });

  return null;
}

function SceneContents() {
  return (
    <>
      <CameraRig />
      <LightingSystem />
      <ROVessel />
      <MembraneAssembly />
      <WaterParticles />
      <ConcentrateFlow />
      <PermeateFlow />
      <SaltParticles />
      <EngineeringLabels />
      <fog attach="fog" args={[COLORS.backgroundDeep, 12, 34]} />

      {/* Procedural studio environment (no external HDRI fetch) so metal
          and polymer materials get believable reflections instead of
          reading as flat black. */}
      <Environment resolution={128}>
        <Lightformer intensity={2.2} color="#bdeeff" position={[0, 5, -8]} scale={[14, 5, 1]} />
        <Lightformer intensity={1.4} color="#ffffff" position={[-8, 2, 5]} rotation={[0, Math.PI / 2, 0]} scale={[8, 8, 1]} />
        <Lightformer intensity={1.1} color={COLORS.accent} position={[8, 1, -3]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 6, 1]} />
        <Lightformer intensity={0.5} color="#0c141c" position={[0, -6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[24, 24, 1]} />
      </Environment>
    </>
  );
}

export default function ROScene({ quality }: ROSceneProps) {
  const dpr: [number, number] = quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [1, 1];

  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance', localClippingEnabled: true }}
      camera={{ position: [0.5, 2.6, 17], fov: 32, near: 0.1, far: 60 }}
      shadows={quality !== 'low'}
      onCreated={({ gl, scene, camera }) => {
        gl.localClippingEnabled = true;
        gl.setClearColor(COLORS.background, 1);
        if (import.meta.env.DEV) {
          (window as any).__ro_scene = scene;
          (window as any).__ro_camera = camera;
        }
      }}
    >
      <color attach="background" args={[COLORS.background]} />
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
    </Canvas>
  );
}
