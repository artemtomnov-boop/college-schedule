import { useEffect, useMemo, useRef, useState } from 'react';

interface Option {
  id: number;
  label: string;
}

interface Props {
  options: Option[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  label?: string;
  id?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Начните вводить…',
  label,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 100); // ограничим, чтобы не рендерить всё сразу
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 100);
  }, [options, query]);

  // Клик вне компонента — закрываем
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // При открытии — очищаем query и ставим highlight на выбранный
  useEffect(() => {
    if (open) {
      setQuery('');
      const idx = filtered.findIndex((o) => o.id === value);
      setHighlight(idx >= 0 ? idx : 0);
      // фокус на инпут
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  function selectOption(opt: Option) {
    onChange(opt.id);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setQuery('');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) selectOption(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="ss" ref={wrapRef}>
      {label && <label className="ss-label" htmlFor={id}>{label}</label>}
      <div
        className={`ss-control ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {!open && (
          <span className={selected ? 'ss-value' : 'ss-placeholder'}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        {open && (
          <input
            ref={inputRef}
            id={id}
            className="ss-input"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
          />
        )}
        {selected && !open && (
          <button
            type="button"
            className="ss-clear"
            onClick={clear}
            aria-label="Очистить"
          >
            ×
          </button>
        )}
        <span className="ss-arrow">{open ? '▴' : '▾'}</span>
      </div>

      {open && (
        <div className="ss-dropdown">
          {filtered.length === 0 && (
            <div className="ss-empty">Ничего не найдено</div>
          )}
          {filtered.map((opt, i) => (
            <div
              key={opt.id}
              className={`ss-option ${i === highlight ? 'highlighted' : ''} ${opt.id === value ? 'selected' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // чтобы не сработал blur
                selectOption(opt);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}