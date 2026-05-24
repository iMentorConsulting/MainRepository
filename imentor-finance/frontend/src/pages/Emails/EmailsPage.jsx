import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0 }) + ' €' : '—';

const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmtDateTime = d => d ? new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// Multi-select dropdown component
function MultiSelectDropdown({ label, options, selected, onChange, getKey, getLabel, getCount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selected.length === 0;
  const displayLabel = allSelected
    ? label
    : selected.length === 1
      ? getLabel(options.find(o => getKey(o) === selected[0]) || {})
      : `${selected.length} επιλεγμένα`;

  const toggle = key => {
    if (selected.includes(key)) {
      onChange(selected.filter(k => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="input flex items-center justify-between gap-2 min-w-[180px] text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span className={`truncate text-sm ${allSelected ? 'text-slate-400' : 'text-slate-700'}`}>{displayLabel}</span>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-slate-400 shrink-0">
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[220px] bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-64 overflow-y-auto">
          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100">
            <input type="checkbox" checked={allSelected} onChange={() => onChange([])}
              className="w-4 h-4 rounded border-slate-300 text-primary-600" />
            <span className="text-sm text-slate-600 font-medium">{label}</span>
          </label>
          {options.map(opt => {
            const key = getKey(opt);
            const checked = selected.includes(key);
            return (
              <label key={key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => toggle(key)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600" />
                <span className="text-sm text-slate-700 flex-1">{getLabel(opt)}</span>
                {getCount && <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">{getCount(opt)}</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EmailsPage() {
  const [activeTab, setActiveTab] = useState('send');

  const [data, setData] = useState({ total: 0, data: [] });
  const [selected, setSelected] = useState(new Set());
  const [selectedYears, setSelectedYears] = useState([String(new Date().getFullYear())]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedAccountants, setSelectedAccountants] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState({ field: 'sale_date', dir: 'DESC' });
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // Per-email custom financing text: { [index]: string }
  const [customFinancingTexts, setCustomFinancingTexts] = useState({});
  const [editingFinancing, setEditingFinancing] = useState({});

  const [accountants, setAccountants] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logSelectedYears, setLogSelectedYears] = useState([String(new Date().getFullYear())]);
  const [logSelectedMonths, setLogSelectedMonths] = useState([]);
  const [logSelectedAccountants, setLogSelectedAccountants] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const yearOptions = years.map(y => ({ value: String(y), label: String(y) }));
  const months = [
    { value: '1', label: 'Ιανουάριος' }, { value: '2', label: 'Φεβρουάριος' },
    { value: '3', label: 'Μάρτιος' }, { value: '4', label: 'Απρίλιος' },
    { value: '5', label: 'Μάιος' }, { value: '6', label: 'Ιούνιος' },
    { value: '7', label: 'Ιούλιος' }, { value: '8', label: 'Αύγουστος' },
    { value: '9', label: 'Σεπτέμβριος' }, { value: '10', label: 'Οκτώβριος' },
    { value: '11', label: 'Νοέμβριος' }, { value: '12', label: 'Δεκέμβριος' }
  ];

  const load = useCallback(() => {
    const params = { limit: 100, page, sort_field: sort.field, sort_dir: sort.dir };
    if (selectedYears.length === 1) params.year = selectedYears[0];
    else if (selectedYears.length > 1) params.years = selectedYears.join(',');
    if (selectedMonths.length === 1) params.month = selectedMonths[0];
    else if (selectedMonths.length > 1) params.months = selectedMonths.join(',');
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    api.get('/income', { params }).then(r => setData(r.data));
  }, [selectedYears, selectedMonths, page, sort, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const year = selectedYears.length === 1 ? selectedYears[0] : new Date().getFullYear();
    api.get('/emails/accountants', { params: { year } }).then(r => setAccountants(r.data)).catch(() => {});
  }, [selectedYears]);

  const loadLogs = useCallback(() => {
    setLogsLoading(true);
    const params = {};
    if (logSelectedYears.length === 1) params.year = logSelectedYears[0];
    if (logSelectedMonths.length === 1) params.month = logSelectedMonths[0];
    if (logSelectedAccountants.length === 1) params.accountant_email = logSelectedAccountants[0];
    api.get('/emails/logs', { params }).then(r => setLogs(r.data)).catch(() => {}).finally(() => setLogsLoading(false));
  }, [logSelectedYears, logSelectedMonths, logSelectedAccountants]);

  useEffect(() => {
    if (activeTab === 'history') loadLogs();
  }, [activeTab, loadLogs]);

  // Filter displayed rows by selected accountants (client-side)
  // Key uses email-or-name fallback, must match what getKey() returns in the dropdown
  const displayedRows = selectedAccountants.length > 0
    ? data.data.filter(r => selectedAccountants.includes(r.accountant_email || r.accountant || ''))
    : data.data;

  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    if (selected.size === displayedRows.length) setSelected(new Set());
    else setSelected(new Set(displayedRows.map(r => r.id)));
  };

  const handlePreview = async () => {
    if (selected.size === 0) return toast.error('Επιλέξτε εγγραφές');
    const res = await api.post('/emails/preview', { income_ids: [...selected] });
    setPreview(res.data);
    setCustomFinancingTexts({});
    setEditingFinancing({});
    setPreviewOpen(true);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await api.post('/emails/send', { income_ids: [...selected] });
      const sent = res.data.results.filter(r => r.status === 'sent').length;
      const skipped = res.data.results.filter(r => r.status === 'skipped').length;
      toast.success(`Εστάλησαν ${sent} email${skipped > 0 ? ` · Παραλείφθηκαν ${skipped}` : ''}`);
      setPreviewOpen(false);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα αποστολής');
    } finally {
      setSending(false);
    }
  };

  const allSelected = selected.size === displayedRows.length && displayedRows.length > 0;

  const SortTh = ({ field, label }) => (
    <th className="th cursor-pointer select-none hover:bg-slate-50" onClick={() => { setSort(s => ({ field, dir: s.field === field && s.dir === 'DESC' ? 'ASC' : 'DESC' })); }}>
      <span className="flex items-center gap-1">
        {label}
        {sort.field === field ? (sort.dir === 'DESC' ? ' ↓' : ' ↑') : <span className="text-slate-300"> ↕</span>}
      </span>
    </th>
  );

  // Extract financing section from HTML
  const extractFinancingSection = (html) => {
    if (!html) return '';
    const match = html.match(/(<[^>]*financing[^>]*>[\s\S]*?<\/[^>]+>|<table[\s\S]*?χρηματοδοτ[\s\S]*?<\/table>)/i);
    return match ? match[0] : '';
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ενημέρωση Λογιστών</h1>
          <p className="page-sub">Αποστολή email ενημέρωσης για νέες πληρωμές</p>
        </div>
        {activeTab === 'send' && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => { if (selected.size === 0) { toast.error('Επιλέξτε εγγραφές για προεπισκόπηση'); return; } handlePreview(); }}>
              Προεπισκόπηση
              {selected.size > 0 && <span className="ml-1.5 bg-slate-200 text-slate-700 text-xs rounded-full px-1.5 py-0.5">{selected.size}</span>}
            </button>
            <button className="btn-primary" onClick={() => { if (selected.size === 0) { toast.error('Επιλέξτε εγγραφές για αποστολή'); return; } handleSend(); }} disabled={sending}>
              {sending ? 'Αποστολή...' : `Αποστολή Email (${selected.size})`}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'send' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('send')}
        >
          Αποστολή
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('history')}
        >
          Ιστορικό
        </button>
      </div>

      {activeTab === 'send' && (
        <>
          <div className="filter-bar flex-wrap">
            <MultiSelectDropdown
              label="Όλα τα Έτη"
              options={yearOptions}
              selected={selectedYears}
              onChange={v => { setSelectedYears(v); setPage(1); setSelected(new Set()); }}
              getKey={o => o.value}
              getLabel={o => o.label}
            />
            <MultiSelectDropdown
              label="Όλοι οι μήνες"
              options={months}
              selected={selectedMonths}
              onChange={v => { setSelectedMonths(v); setPage(1); setSelected(new Set()); }}
              getKey={o => o.value}
              getLabel={o => o.label}
            />
            <MultiSelectDropdown
              label="Όλοι οι λογιστές"
              options={accountants}
              selected={selectedAccountants}
              onChange={v => { setSelectedAccountants(v); setSelected(new Set()); }}
              getKey={o => o.accountant_email || o.accountant || ''}
              getLabel={o => o.accountant_name || o.accountant || ''}
              getCount={o => o.count}
            />
            <div className="flex items-center gap-1 text-slate-400 text-xs">ή</div>
            <div className="flex items-center gap-1">
              <input type="date" className="input w-36 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="Από" />
              <span className="text-slate-400 text-xs">—</span>
              <input type="date" className="input w-36 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="Έως" />
              {(dateFrom || dateTo) && (
                <button className="btn-ghost btn-sm text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>✕</button>
              )}
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-medium">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/></svg>
                {selected.size} επιλεγμένες
              </div>
            )}
            <button className="btn-ghost btn-sm ml-auto" onClick={() => setSelected(new Set())}>
              Αποεπιλογή
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                    </th>
                    <SortTh field="sale_date" label="Ημερομηνία" />
                    <SortTh field="customer_name" label="Πελάτης" />
                    <SortTh field="service_type" label="Υπηρεσία" />
                    <SortTh field="amount_collected" label="Ποσό" />
                    <SortTh field="accountant" label="Λογιστής" />
                    <th className="th">Τιμολόγιο</th>
                    <th className="th">Ενημέρωση</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map(r => (
                    <tr key={r.id} className={`tr cursor-pointer ${selected.has(r.id) ? 'bg-indigo-50/50' : ''}`}
                      onClick={() => toggle(r.id)}>
                      <td className="td" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                          className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                      </td>
                      <td className="td whitespace-nowrap text-slate-500 text-xs">{fmtDate(r.sale_date)}</td>
                      <td className="td">
                        <div className="font-semibold text-slate-800 max-w-[160px] truncate">{r.customer_name}</div>
                      </td>
                      <td className="td max-w-[140px]">
                        <div className="text-xs text-slate-500 truncate">{r.service_type || '—'}</div>
                      </td>
                      <td className="td font-bold text-emerald-600 whitespace-nowrap">{fmt(r.amount_collected)}</td>
                      <td className="td text-sm text-slate-600">{r.accountant || <span className="text-slate-300">—</span>}</td>
                      <td className="td">
                        {r.invoice_number
                          ? <span className="badge-blue text-xs">{r.invoice_number}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="td">
                        {r.accountant_notified
                          ? <span className="badge-green">✓ {fmtDate(r.accountant_notified_at)}</span>
                          : <span className="badge-gray">Όχι</span>}
                      </td>
                    </tr>
                  ))}
                  {displayedRows.length === 0 && (
                    <tr><td colSpan={8} className="td text-center text-slate-400 py-12">
                      <div className="text-3xl mb-2">📧</div>
                      Δεν βρέθηκαν εγγραφές
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">Σελίδα {page} · {data.total.toLocaleString('el-GR')} σύνολο</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="btn-secondary btn-sm disabled:opacity-40">← Προηγ.</button>
                <button disabled={page * 100 >= data.total} onClick={() => setPage(p => p + 1)}
                  className="btn-secondary btn-sm disabled:opacity-40">Επόμ. →</button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <>
          <div className="filter-bar">
            <MultiSelectDropdown
              label="Όλα τα Έτη"
              options={yearOptions}
              selected={logSelectedYears}
              onChange={setLogSelectedYears}
              getKey={o => o.value}
              getLabel={o => o.label}
            />
            <MultiSelectDropdown
              label="Όλοι οι μήνες"
              options={months}
              selected={logSelectedMonths}
              onChange={setLogSelectedMonths}
              getKey={o => o.value}
              getLabel={o => o.label}
            />
            <MultiSelectDropdown
              label="Όλοι οι λογιστές"
              options={accountants}
              selected={logSelectedAccountants}
              onChange={setLogSelectedAccountants}
              getKey={o => o.accountant_email || o.accountant || ''}
              getLabel={o => o.accountant_name || o.accountant || ''}
              getCount={o => o.count}
            />
            <button className="btn-secondary btn-sm" onClick={loadLogs}>Φίλτρα</button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Ημερομηνία','Λογιστής','Email','Εγγραφές','Σύνολο'].map(h => (
                      <th key={h} className="th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logsLoading && (
                    <tr><td colSpan={5} className="td text-center text-slate-400 py-12">Φόρτωση...</td></tr>
                  )}
                  {!logsLoading && logs.map(log => (
                    <tr key={log.id} className="tr">
                      <td className="td whitespace-nowrap text-slate-500 text-xs">{fmtDateTime(log.createdAt)}</td>
                      <td className="td font-medium text-slate-800">{log.accountant_name}</td>
                      <td className="td text-sm text-slate-600">{log.accountant_email || <span className="text-slate-300">—</span>}</td>
                      <td className="td">
                        <span className="badge-blue">{log.records_count}</span>
                      </td>
                      <td className="td font-bold text-emerald-600 whitespace-nowrap">{fmt(log.total_amount)}</td>
                    </tr>
                  ))}
                  {!logsLoading && logs.length === 0 && (
                    <tr><td colSpan={5} className="td text-center text-slate-400 py-12">
                      <div className="text-3xl mb-2">📋</div>
                      Δεν υπάρχουν εγγραφές ιστορικού
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {!logsLoading && logs.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">{logs.length.toLocaleString('el-GR')} εγγραφές</span>
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Προεπισκόπηση Email" size="xl">
        <div className="space-y-4">
          {preview.map((email, i) => {
            const isEditingFinancing = editingFinancing[i];
            const customText = customFinancingTexts[i];

            // Build displayed HTML: replace financing section if customized
            const displayHtml = customText !== undefined
              ? email.html.replace(/<div[^>]*class="[^"]*financing[^"]*"[\s\S]*?<\/div>|<table[\s\S]*?χρηματοδοτ[\s\S]*?<\/table>/i, customText)
              : email.html;

            return (
              <div key={i} className="rounded-xl overflow-hidden border border-slate-200">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700 text-sm">Προς: <span className="text-indigo-600">{email.email || 'χωρίς email'}</span></span>
                    <span className="text-xs text-slate-400">{email.subject}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge-blue">{email.accountant}</span>
                  </div>
                </div>
                <div className="p-4 bg-white">
                  <div className="max-h-56 overflow-y-auto" dangerouslySetInnerHTML={{ __html: displayHtml }} />
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Χρηματοδοτικά Προγράμματα</span>
                      <button
                        className="btn-ghost btn-sm text-xs"
                        onClick={() => {
                          if (isEditingFinancing) {
                            setEditingFinancing(prev => ({ ...prev, [i]: false }));
                          } else {
                            // Extract current financing text from HTML
                            const match = email.html.match(/<div[^>]*class="[^"]*financing[^"]*"[\s\S]*?<\/div>|<section[\s\S]*?χρηματοδοτ[\s\S]*?<\/section>/i);
                            const current = customFinancingTexts[i] !== undefined
                              ? customFinancingTexts[i]
                              : (match ? match[0] : '');
                            setCustomFinancingTexts(prev => ({ ...prev, [i]: current }));
                            setEditingFinancing(prev => ({ ...prev, [i]: true }));
                          }
                        }}
                      >
                        {isEditingFinancing ? '✓ Αποθήκευση' : '✎ Επεξεργασία'}
                      </button>
                    </div>
                    {isEditingFinancing && (
                      <textarea
                        className="input w-full text-xs font-mono min-h-[100px] resize-y"
                        value={customFinancingTexts[i] || ''}
                        onChange={e => setCustomFinancingTexts(prev => ({ ...prev, [i]: e.target.value }))}
                        placeholder="Εισάγετε HTML κείμενο για τα χρηματοδοτικά προγράμματα..."
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button className="btn-secondary" onClick={() => setPreviewOpen(false)}>Ακύρωση</button>
            <button className="btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? 'Αποστολή...' : 'Αποστολή'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
