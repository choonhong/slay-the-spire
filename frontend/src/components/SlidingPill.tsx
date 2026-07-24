import { useLayoutEffect, useRef } from 'react';

export interface PillOption {
  id: string;
  label: string;
  activeClass?: string; // override active bg, e.g. 'bg-purple-600'
}

interface Props {
  options: PillOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  bare?: boolean; // if true, no glass-sm container — just the floating active pill
}

export default function SlidingPill({ options, value, onChange, className = '', bare = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs   = useRef<(HTMLButtonElement | null)[]>([]);
  const sliderRef    = useRef<HTMLDivElement>(null);
  const isFirst      = useRef(true);
  // Keep a ref to current activeIdx so the ResizeObserver callback can read it
  const activeIdxRef = useRef(-1);

  const activeIdx = options.findIndex(o => o.id === value);
  const activeOpt = options[activeIdx];
  activeIdxRef.current = activeIdx;

  function position(animated: boolean) {
    const btn    = buttonRefs.current[activeIdxRef.current];
    const slider = sliderRef.current;
    if (!btn || !slider) return;

    // If the container is still hidden (offsetWidth === 0), don't measure yet
    if (btn.offsetWidth === 0) return;

    slider.style.transition = animated
      ? 'left 200ms cubic-bezier(0.4,0,0.2,1), width 200ms cubic-bezier(0.4,0,0.2,1)'
      : 'none';
    slider.style.left    = `${btn.offsetLeft}px`;
    slider.style.width   = `${btn.offsetWidth}px`;
    slider.style.opacity = activeIdxRef.current >= 0 ? '1' : '0';
  }

  // Reposition whenever activeIdx or options.length changes
  useLayoutEffect(() => {
    const animated = !isFirst.current;
    if (isFirst.current) isFirst.current = false;
    position(animated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, options.length]);

  // Reposition when the container becomes visible (display:none → visible).
  // Only snap if the slider hasn't been measured yet (width still 0),
  // so we never interfere with the animated transitions on click.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      const slider = sliderRef.current;
      if (!slider) return;
      // If the slider already has a real width it was positioned while visible — skip.
      if (parseFloat(slider.style.width || '0') > 0) return;
      position(false);
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
      {/* Sliding indicator — all geometry written via DOM ref, never via React style prop */}
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
