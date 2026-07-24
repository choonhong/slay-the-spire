import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshLabel?: string;
  countLabel?: string;
  right?: ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  onRefresh,
  refreshLabel = 'Refresh',
  countLabel,
  right,
}: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-3xl font-bold text-gray-100 tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 pt-0.5">
        {countLabel && (
          <span className="text-xs text-gray-500">{countLabel}</span>
        )}
        {right}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-4 py-1.5 rounded-full text-sm text-gray-300 hover:text-white transition-all glass-button"
          >
            {refreshLabel}
          </button>
        )}
      </div>
    </div>
  );
}
