import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { isManualOverrideActive, markScrollActivity, setProgress } from './progressStore';

gsap.registerPlugin(ScrollTrigger);

export interface ScrollTimelineHandle {
  scrollTrigger: ScrollTrigger;
  destroy: () => void;
}

/**
 * Drives global scroll progress (0..1) from a tall spacer element's scroll
 * position. The visual viewport itself stays `position: sticky` in CSS, so
 * ScrollTrigger only needs to scrub a number -- no JS pinning, which keeps
 * this safe to later embed inside a larger page layout.
 */
export function createScrollTimeline(trigger: HTMLElement): ScrollTimelineHandle {
  const st = ScrollTrigger.create({
    trigger,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.6,
    onUpdate: (self) => {
      if (isManualOverrideActive()) return;
      setProgress(self.progress);
      markScrollActivity();
    },
  });

  return {
    scrollTrigger: st,
    destroy: () => st.kill(),
  };
}

/** Programmatically scroll to a given progress in [0,1], used by reset (R key). */
export function scrollToProgress(trigger: HTMLElement, p: number): void {
  const st = ScrollTrigger.getAll().find((s) => s.trigger === trigger);
  if (!st) return;
  const y = st.start + (st.end - st.start) * p;
  window.scrollTo({ top: y, behavior: 'smooth' });
}
