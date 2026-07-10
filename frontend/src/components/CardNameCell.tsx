import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CardText } from '../api';

const ENERGY_COLOR: Record<string, string> = {
  '0': 'bg-green-800 text-green-200',
  '1': 'bg-blue-800 text-blue-200',
  '2': 'bg-purple-800 text-purple-200',
  '3': 'bg-red-800 text-red-200',
  'X': 'bg-orange-800 text-orange-200',
};

function CardTooltip({ cardText, anchorRect }: { cardText: CardText; anchorRect: DOMRect }) {
  const energyStyle = ENERGY_COLOR[cardText.cost] ?? 'bg-gray-700 text-gray-300';
  const TOOLTIP_WIDTH = 224;

  const left = Math.min(
    Math.max(8, anchorRect.left + anchorRect.width / 2 - TOOLTIP_WIDTH / 2),
    window.innerWidth - TOOLTIP_WIDTH - 8,
  );
  const top = anchorRect.top - 8;

  return createPortal(
    <div
      className="fixed z-[9999] w-56 rounded-lg border border-gray-600 bg-gray-900 shadow-xl p-3 pointer-events-none"
      style={{ left, top, transform: 'translateY(-100%)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${energyStyle}`}>
          {cardText.cost}
        </span>
        <span className="text-xs text-gray-400 uppercase tracking-wide">{cardText.type} · {cardText.rarity}</span>
      </div>
      <p className="text-sm text-gray-200 leading-snug">
        {cardText.description || <span className="text-gray-500 italic">No description</span>}
      </p>
      {cardText.keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {cardText.keywords.map(kw => (
            <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{kw}</span>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

const RARITY_COLOR: Record<string, string> = {
  Rare:     'text-yellow-400',
  Uncommon: 'text-blue-400',
  Common:   'text-gray-200',
  Starter:  'text-red-400',
  Special:  'text-purple-400',
  Curse:    'text-red-500',
};

export function CardNameCell({
  id,
  cardTextMap,
  className = '',
  colorByRarity = false,
}: {
  id: string;
  cardTextMap: Map<string, CardText>;
  className?: string;
  colorByRarity?: boolean;
}) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const ct = cardTextMap.get(id);
  const name = ct?.name ?? id.replace(/^CARD\./, '').replace(/_/g, ' ');
  const rarityClass = colorByRarity ? (RARITY_COLOR[ct?.rarity ?? ''] ?? 'text-gray-200') : '';
  const baseClass = !colorByRarity && !className ? 'font-medium text-gray-100' : '';

  return (
    <span
      ref={ref}
      className={`cursor-default ${baseClass} ${rarityClass} ${className}`}
      onMouseEnter={() => ref.current && setAnchorRect(ref.current.getBoundingClientRect())}
      onMouseLeave={() => setAnchorRect(null)}
    >
      {name}
      {ct && anchorRect && <CardTooltip cardText={ct} anchorRect={anchorRect} />}
    </span>
  );
}
