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
        <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
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
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            {refreshLabel}
          </button>
        )}
      </div>
    </div>
  );
}
