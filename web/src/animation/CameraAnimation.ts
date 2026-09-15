import { Vector3 } from 'three';
import { smoothstep } from './constants';

export interface CameraKeyframe {
  t: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

// Cinematic camera path through the RO establishing shot -> interior -> membrane
// close-up -> pull back -> exit. Values are hand-tuned against the vessel built
// in ROVessel.tsx (length ~10 along X, radius ~1.15, centred at origin).
// Radius-from-axis for every interior keyframe is kept comfortably above the
// vessel radius (1.15) so the camera never clips through the shell or a
// membrane element -- "closeness" during the membrane stage comes from a
// tight FOV rather than physically passing inside the geometry.
export const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { t: 0.0, position: [0.5, 2.6, 17], target: [0, 0, 0], fov: 32 },
  { t: 0.1, position: [1.2, 1.9, 11], target: [0, 0, 0], fov: 32 },
  { t: 0.2, position: [5.5, 2.6, 7.5], target: [0, 0.1, 0], fov: 30 },
  { t: 0.3, position: [4.0, 1.8, 4.2], target: [0.5, 0, 0], fov: 28 },
  { t: 0.4, position: [2.6, 1.6, 3.0], target: [-2, 0, 0], fov: 27 },
  { t: 0.5, position: [-1.5, 1.4, 2.6], target: [-3.2, 0.1, 0], fov: 25 },
  { t: 0.58, position: [-3.3, 1.3, 2.6], target: [-3.9, 0, 0], fov: 27 },
  { t: 0.65, position: [-3.9, 1.05, 2.15], target: [-3.9, 0, 0], fov: 24 },
  { t: 0.75, position: [-1.0, 1.3, 2.1], target: [1.5, 0, 0], fov: 24 },
  { t: 0.85, position: [4.5, 2.2, 4.6], target: [1, 0, 0], fov: 29 },
  { t: 0.9, position: [7.5, 3.2, 7.0], target: [0, 0, 0], fov: 33 },
  { t: 1.0, position: [-0.3, 2.7, 15.5], target: [0, 0, 0], fov: 32 },
];

const posA = new Vector3();
const posB = new Vector3();
const tgtA = new Vector3();
const tgtB = new Vector3();

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  fov: number;
}

const outPosition = new Vector3();
const outTarget = new Vector3();

/** Evaluate the cinematic camera path at scroll progress p in [0,1]. */
export function evaluateCameraPath(p: number): CameraPose {
  const frames = CAMERA_KEYFRAMES;
  let i = 0;
  while (i < frames.length - 2 && p > frames[i + 1].t) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const span = b.t - a.t || 1;
  const localT = smoothstep((p - a.t) / span);

  posA.set(...a.position);
  posB.set(...b.position);
  tgtA.set(...a.target);
  tgtB.set(...b.target);

  outPosition.lerpVectors(posA, posB, localT);
  outTarget.lerpVectors(tgtA, tgtB, localT);
  const fov = a.fov + (b.fov - a.fov) * localT;

  return { position: outPosition, target: outTarget, fov };
}
