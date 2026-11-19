import { useState, useEffect, useRef } from 'react';
import api from '../api/client';

export default function CustomerSearch({ value, onSelect, placeholder = 'Αναζήτηση πελάτη...' }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!query || query.length < 1) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get(`/customers?search=${encodeURIComponent(query)}&limit=8`);
        setResults(r.data.data || []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const select = c => {
    setQuery(c.name);
    setOpen(false);
    onSelect(c);
  };

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); if (!e.target.value) onSelect(null); }}
        onFocus={() => query && results.length && setOpen(true)}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          {loading && <div className="px-3 py-2 text-xs text-slate-400">Αναζήτηση…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">Δεν βρέθηκε αποτέλεσμα</div>
          )}
          {results.map(c => (
            <button key={c.id} type="button" onClick={() => select(c)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-slate-50 border-b border-slate-50 last:border-0">
              <span className="font-medium text-slate-800 truncate">{c.name}</span>
              {c.vat_number && <span className="badge-gray text-xs ml-2 shrink-0">{c.vat_number}</span>}
            </button>
          ))}
          <button type="button" onClick={() => { setOpen(false); onSelect({ name: query, _new: true }); }}
            className="w-full px-3 py-2.5 text-xs text-indigo-600 font-semibold text-left hover:bg-indigo-50 border-t border-slate-100">
            + Νέος πελάτης "{query}"
          </button>
        </div>
      )}
    </div>
  );
}
