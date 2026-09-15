// Render quality tier, decided once at startup from viewport/device and
// read by geometry + particle systems before they build their buffers.
// Not meant to change mid-session in this prototype.

export type Quality = 'high' | 'medium' | 'low';

let quality: Quality = 'high';

export function setQuality(q: Quality): void {
  quality = q;
}

export function getQuality(): Quality {
  return quality;
}

export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  const w = window.innerWidth;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  if (w < 640 || (coarsePointer && w < 900)) return 'low';
  if (w < 1100) return 'medium';
  return 'high';
}

/** Scales particle counts / geometry segments down for lower tiers. */
export function qualityScale(): number {
  switch (quality) {
    case 'low':
      return 0.4;
    case 'medium':
      return 0.68;
    default:
      return 1;
  }
}

export function scaleCount(base: number, min = 24): number {
  return Math.max(min, Math.round(base * qualityScale()));
}
