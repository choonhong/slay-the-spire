import { useLayoutEffect, useRef } from 'react';

export interface PillOption {
  id: string;
  label: string;
  activeClass?: string;
}

interface Props {
  options: PillOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  bare?: boolean;
}

const TRANSITION = 'left 200ms cubic-bezier(0.4,0,0.2,1), width 200ms cubic-bezier(0.4,0,0.2,1)';

export default function SlidingPill({ options, value, onChange, className = '', bare = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs   = useRef<(HTMLButtonElement | null)[]>([]);
  const sliderRef    = useRef<HTMLDivElement>(null);
  const activeIdxRef = useRef(-1);
  const rafRef       = useRef<number | null>(null);

  const activeIdx = options.findIndex(o => o.id === value);
  const activeOpt = options[activeIdx];
  activeIdxRef.current = activeIdx;

  useLayoutEffect(() => {
    const btn    = buttonRefs.current[activeIdx];
    const slider = sliderRef.current;
    if (!btn || !slider || btn.offsetWidth === 0) return;

    // Capture geometry NOW (before paint) so RAF uses correct values.
    const left  = btn.offsetLeft;
    const width = btn.offsetWidth;

    const alreadyPlaced = parseFloat(slider.style.width || '0') > 0;

    // Cancel any pending animation frame
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    if (!alreadyPlaced) {
      // ── Snap (initial placement, no animation) ──────────────────────────
      slider.style.transition = 'none';
      slider.style.left       = `${left}px`;
      slider.style.width      = `${width}px`;
      slider.style.opacity    = '1';
      // Re-enable transition after two frames so future slides animate.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          if (sliderRef.current) sliderRef.current.style.transition = TRANSITION;
          rafRef.current = null;
        });
      });
    } else {
      // ── FLIP slide (animated change) ────────────────────────────────────
      // All work happens inside a RAF so it fires in a fresh rendering frame,
      // AFTER any same-frame layout effects from other components (e.g. Synergies
      // pills snapping into place) have already completed.
      //
      // Inside the RAF we use the FLIP technique:
      //   1. Disable transition, commit the slider's CURRENT position via a
      //      forced reflow — this becomes the CSS transition's start point.
      //   2. Enable transition, set the new position — browser animates.
      //
      // Because we force our own reflow inside the RAF, external reflows from
      // other components cannot interfere with our transition's start value.
      rafRef.current = requestAnimationFrame(() => {
        const s = sliderRef.current;
        if (!s) { rafRef.current = null; return; }

        // Step 1 – pin current position as transition start
        const curLeft  = s.style.left  || '0px';
        const curWidth = s.style.width || `${width}px`;
        s.style.transition = 'none';
        s.style.left       = curLeft;
        s.style.width      = curWidth;
        void s.offsetLeft; // force reflow — commits current values

        // Step 2 – enable transition and move to new position
        s.style.transition = TRANSITION;
        s.style.left       = `${left}px`;
        s.style.width      = `${width}px`;
        s.style.opacity    = '1';

        rafRef.current = null;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, options.length]);

  // Snap when the container goes from hidden → visible (display:none removed)
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const slider = sliderRef.current;
      const btn    = buttonRefs.current[activeIdxRef.current];
      if (!slider || !btn || btn.offsetWidth === 0) return;
      if (parseFloat(slider.style.width || '0') > 0) return; // already placed
      slider.style.transition = 'none';
      slider.style.left       = `${btn.offsetLeft}px`;
      slider.style.width      = `${btn.offsetWidth}px`;
      slider.style.opacity    = '1';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (sliderRef.current) sliderRef.current.style.transition = TRANSITION;
        });
      });
    });
    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative flex rounded-full flex-wrap ${bare ? 'p-0' : 'p-0.5 glass-sm'} ${className}`}
    >
      <div
        ref={sliderRef}
        className={`absolute top-0.5 bottom-0.5 rounded-full pointer-events-none ${activeOpt?.activeClass ?? 'bg-spire-600'}`}
      />
      {options.map((opt, i) => (
        <button
          key={opt.id}
          ref={el => { buttonRefs.current[i] = el; }}
          onClick={() => onChange(opt.id)}
          className={`relative z-10 px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-150 ${
            opt.id === value ? 'text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
