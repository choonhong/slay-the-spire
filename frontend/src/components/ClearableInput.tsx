import { useRef, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

/** Text input with a clear (×) button when non-empty. */
export default function ClearableInput({
  value,
  onChange,
  className = '',
  ...rest
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const showClear = value.length > 0;
  const widthClass = className.match(/\bw-[\w\[\]\.\/-]+/)?.[0];

  return (
    <div className={`relative ${widthClass ?? 'inline-block'}`}>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={[className, widthClass ? 'w-full' : '', showClear ? 'pr-8' : ''].filter(Boolean).join(' ')}
        {...rest}
      />
      {showClear && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Clear"
          onMouseDown={e => {
            e.preventDefault();
            onChange('');
            ref.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 text-lg leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}
