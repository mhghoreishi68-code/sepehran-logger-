import { MEMBRANE_COUNT, smoothstep, stageProgress } from './constants';

export interface VesselState {
  rotationY: number;
  cutawayAngle: number; // radians of shell removed (0 = whole, up to ~4.4 = mostly open)
  shellOpacity: number;
  shellDim: number; // 0..1 interior dimming toward the transition
}

const MAX_CUTAWAY = Math.PI * 1.35;

export function evaluateVesselState(p: number): VesselState {
  const rotate = smoothstep(stageProgress(p, 0.1, 0.3));
  const openClose1 = smoothstep(stageProgress(p, 0.28, 0.42));
  const closeAgain = smoothstep(stageProgress(p, 0.94, 1.0));

  const rotationY = rotate * 0.62 * (1 - closeAgain * 0.0); // hold rotation
  const cutawayAngle = MAX_CUTAWAY * openClose1 * (1 - closeAgain);

  // Brief opacity dip while the shell transitions into cutaway, for a
  // cinematic "dissolve" rather than a hard geometric pop.
  const transitionPulse = smoothstep(stageProgress(p, 0.26, 0.33)) *
    (1 - smoothstep(stageProgress(p, 0.33, 0.4)));
  const shellOpacity = 1 - transitionPulse * 0.55;

  return {
    rotationY,
    cutawayAngle,
    shellOpacity,
    shellDim: openClose1,
  };
}

/** Per-membrane reveal factor (scale/opacity), staggered across the stack. */
export function evaluateMembraneReveal(p: number, index: number): number {
  const startBase = 0.34;
  const stagger = 0.022;
  const duration = 0.09;
  const start = startBase + index * stagger;
  const closeStart = 0.95;
  const closeAmount = smoothstep(stageProgress(p, closeStart, 1.0));
  const reveal = smoothstep(stageProgress(p, start, start + duration));
  return reveal * (1 - closeAmount);
}

export function membraneIndices(): number[] {
  return Array.from({ length: MEMBRANE_COUNT }, (_, i) => i);
}
