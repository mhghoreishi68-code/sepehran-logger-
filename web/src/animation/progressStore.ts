// Minimal external store for scroll progress.
// R3F components read it every frame via getProgress() (no React re-render cost).
// UI components subscribe reactively via the useProgress() hook.

import { useSyncExternalStore } from 'react';

type Listener = () => void;

let progress = 0;
let scrollDirection: 1 | -1 = 1;
const listeners = new Set<Listener>();

export function setProgress(next: number): void {
  const clamped = Math.min(1, Math.max(0, next));
  if (clamped === progress) return;
  scrollDirection = clamped >= progress ? 1 : -1;
  progress = clamped;
  listeners.forEach((l) => l());
}

export function getProgress(): number {
  return progress;
}

export function getScrollDirection(): 1 | -1 {
  return scrollDirection;
}

export function subscribeProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProgress(): number {
  return useSyncExternalStore(subscribeProgress, getProgress, getProgress);
}

// --- Pointer parallax (subtle, only active while idle / not scrolling) ---
let pointer = { x: 0, y: 0 };
export function setPointer(x: number, y: number): void {
  pointer = { x, y };
}
export function getPointer(): { x: number; y: number } {
  return pointer;
}

// --- Debug manual override ---
let manualOverride = false;
export function setManualOverrideActive(active: boolean): void {
  manualOverride = active;
}
export function isManualOverrideActive(): boolean {
  return manualOverride;
}

let lastScrollAt = 0;
export function markScrollActivity(): void {
  lastScrollAt = performance.now();
}
/** 0 right after scroll activity, ramping back to 1 once the user is idle -- keeps parallax from fighting ScrollTrigger. */
export function getParallaxFactor(): number {
  const dt = performance.now() - lastScrollAt;
  return Math.min(1, Math.max(0, (dt - 200) / 400));
}
