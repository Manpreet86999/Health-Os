import { useEffect } from 'react';
const scroll = new Map<string, number>();
export function RouteExperience({ identity, label }: { identity: string; label: string }) {
  useEffect(() => {
    document.title = `${label} · Health OS`;
    const main = document.getElementById('health-main-content');
    let focused = false, active = true;
    const focus = () => {
      if (!active || focused || document.body.dataset.uxOverlayOpen) return;
      const heading = Array.from(main?.querySelectorAll<HTMLElement>('h1,h2') || []).find(element => element.getClientRects().length);
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); focused = true; window.scrollTo({ top: scroll.get(identity) || 0, behavior: 'instant' }); }
    };
    const observer = new MutationObserver(focus); if (main) observer.observe(main, { childList: true, subtree: true });
    const overlayChanged=()=>requestAnimationFrame(focus);
    window.addEventListener('health-os-overlay-changed',overlayChanged);
    const frame = requestAnimationFrame(focus);
    return () => { active=false;scroll.set(identity, window.scrollY); observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('health-os-overlay-changed',overlayChanged); };
  }, [identity, label]);
  return <p className="ux-sr-only" aria-live="polite" aria-atomic="true">{label}</p>;
}
