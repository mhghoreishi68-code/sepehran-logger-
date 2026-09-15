import { MEMBRANE_TUBE_RADIUS, VESSEL_LENGTH, smoothstep, stageProgress } from './constants';

// Shared geometry landmarks for the particle flow paths. Kept as plain
// numbers (not Vector3) so the hot per-particle update loops stay
// allocation-free.
export const FLOW_FEED_START = -(VESSEL_LENGTH / 2 + 2.6);
export const FLOW_STACK_START = -(VESSEL_LENGTH / 2 - 0.7);
export const FLOW_STACK_END = VESSEL_LENGTH / 2 - 0.7;
export const FLOW_REJECT_END = VESSEL_LENGTH / 2 + 2.6;
export const FLOW_OUTER_RADIUS = 0.92;
export const FLOW_TUBE_RADIUS = MEMBRANE_TUBE_RADIUS * 1.4;
export const FLOW_PERMEATE_EXIT_X = VESSEL_LENGTH / 2 - 0.55;

export interface ParticleSeeds {
  u0: Float32Array;
  angle: Float32Array;
  radiusJitter: Float32Array;
  crossPoint: Float32Array; // where along the stack (0..1) this particle crosses to permeate
}

export function makeSeeds(count: number, rngSeed = 1): ParticleSeeds {
  let s = rngSeed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const u0 = new Float32Array(count);
  const angle = new Float32Array(count);
  const radiusJitter = new Float32Array(count);
  const crossPoint = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    u0[i] = rand();
    angle[i] = rand() * Math.PI * 2;
    radiusJitter[i] = 0.85 + rand() * 0.3;
    crossPoint[i] = 0.15 + rand() * 0.7;
  }
  return { u0, angle, radiusJitter, crossPoint };
}

/** Continuous feed/concentrate lane: straight through the outer annulus. */
export function outerLaneX(s: number, xStart: number, xEnd: number): number {
  return xStart + (xEnd - xStart) * s;
}

/** Radius pulled slightly outward mid-vessel to suggest pressurised swirl. */
export function outerLaneRadius(base: number, jitter: number): number {
  return base * jitter;
}

/**
 * Permeate lane: travels the outer annulus until `crossAt`, then spirals
 * radially inward to the central tube radius and continues to the exit.
 * Returns { x, radius, inTube }.
 */
export function permeateLaneSample(
  s: number,
  crossAt: number,
): { x: number; radiusT: number } {
  const crossWindow = 0.12;
  if (s < crossAt) {
    const x = outerLaneX(s / crossAt, FLOW_STACK_START, FLOW_STACK_START + (FLOW_STACK_END - FLOW_STACK_START) * crossAt);
    return { x, radiusT: 0 };
  }
  const crossEnd = Math.min(1, crossAt + crossWindow);
  if (s < crossEnd) {
    const localT = (s - crossAt) / (crossEnd - crossAt);
    const x = FLOW_STACK_START + (FLOW_STACK_END - FLOW_STACK_START) * (crossAt + (crossEnd - crossAt) * 0.5 * localT);
    return { x, radiusT: smoothstep(localT) };
  }
  const localT = (s - crossEnd) / (1 - crossEnd);
  const x = FLOW_STACK_START + (FLOW_STACK_END - FLOW_STACK_START) * crossEnd + (FLOW_PERMEATE_EXIT_X - (FLOW_STACK_START + (FLOW_STACK_END - FLOW_STACK_START) * crossEnd)) * localT;
  return { x, radiusT: 1 };
}

export function laneVisibility(p: number, start: number, end: number, fadeOutStart = 1.02, fadeOutEnd = 1.1): number {
  const fadeIn = smoothstep(stageProgress(p, start, end));
  const fadeOut = 1 - smoothstep(stageProgress(p, fadeOutStart, fadeOutEnd));
  return fadeIn * fadeOut;
}
