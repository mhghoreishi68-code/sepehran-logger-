// Shared engineering/visual constants for the RO experience.
// Centralised so the scroll timeline, camera path, vessel and flow systems
// all agree on geometry and stage boundaries.

export const VESSEL_LENGTH = 10;
export const VESSEL_RADIUS = 1.15;
export const VESSEL_HEAD_LENGTH = 0.9;

export const MEMBRANE_COUNT = 5;
export const MEMBRANE_RADIUS = 0.82;
export const MEMBRANE_GAP = 0.12;
export const MEMBRANE_TUBE_RADIUS = 0.1;

// Derived: total span occupied by the membrane stack, centred on the vessel axis.
export const MEMBRANE_ELEMENT_LENGTH =
  (VESSEL_LENGTH - VESSEL_HEAD_LENGTH * 0.4 - MEMBRANE_GAP * (MEMBRANE_COUNT - 1)) /
  MEMBRANE_COUNT;

export const STAGE_BOUNDARIES = {
  hero: 0.0,
  approach: 0.1,
  rotate: 0.2,
  cutawayBegin: 0.3,
  membranesRevealed: 0.4,
  waterEnters: 0.5,
  channelTravel: 0.6,
  permeateSplit: 0.7,
  concentrateSplit: 0.8,
  overview: 0.9,
  finalHero: 1.0,
} as const;

export const COLORS = {
  background: '#04070c',
  backgroundDeep: '#01030a',
  accent: '#37e0d0',
  accentDim: '#1c8f88',
  vesselMetal: '#2a3138',
  vesselMetalDark: '#14181d',
  membraneBody: '#dfe6e8',
  membraneTube: '#9aa7ac',
  permeate: '#7fe9ff',
  concentrate: '#1f6fa8',
  salt: '#e0a95c',
  rimLight: '#4fd7ff',
};

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Remap p from [start, end] to [0, 1], clamped. */
export function stageProgress(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0;
  return clamp01((p - start) / (end - start));
}

export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
