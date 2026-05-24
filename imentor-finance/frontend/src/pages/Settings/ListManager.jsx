import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

const LIST_TYPES = [
  { key: 'ΚΑΤΗΓΟΡΙΕΣ_ΕΞΟΔΩΝ',  label: 'Κατηγορίες Εξόδων',     color: 'bg-orange-500' },
  { key: 'ΠΡΟΜΗΘΕΥΤΕΣ',         label: 'Προμηθευτές / Υπάλληλοι', color: 'bg-blue-500' },
  { key: 'ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ',  label: 'Κατάσταση Εργασίας',     color: 'bg-violet-500' },
  { key: 'ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ',    label: 'Είδος Υπηρεσίας',         color: 'bg-emerald-500' },
  { key: 'ΠΗΓΗ_ΣΥΣΤΑΣΗ',        label: 'Πηγή / Σύσταση',          color: 'bg-pink-500' },
  { key: 'ΠΡΑΚΤΟΡΕΣ',           label: 'Πράκτορες',               color: 'bg-amber-500' },
];

export default function ListManager() {
  const [activeType, setActiveType] = useState(LIST_TYPES[0].key);
  const [items, setItems] = useState([]);
  const [newValue, setNewValue] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const load = () => api.get(`/lists?list_type=${activeType}`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [activeType]);

  const toggleActive = async item => {
    try { await api.put(`/lists/${item.id}`, { is_active: !item.is_active }); load(); }
    catch { toast.error('Σφάλμα'); }
  };

  const addSingle = async () => {
    if (!newValue.trim()) return;
    try {
      await api.post('/lists', { list_type: activeType, value: newValue.trim(), is_active: true });
      toast.success('Προστέθηκε!');
      setNewValue('');
      load();
    } catch { toast.error('Σφάλμα'); }
  };

  const addBulk = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return toast.error('Δεν υπάρχουν στοιχεία');
    try {
      await Promise.all(lines.map(v =>
        api.post('/lists', { list_type: activeType, value: v, is_active: true })
      ));
      toast.success(`Προστέθηκαν ${lines.length} στοιχεία!`);
      setBulkText('');
      setShowBulk(false);
      load();
    } catch { toast.error('Σφάλμα μαζικής εισαγωγής'); }
  };

  const deleteItem = async id => {
    try { await api.delete(`/lists/${id}`); load(); }
    catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const r = await api.post('/lists/seed');
      toast.success(`Προστέθηκαν ${r.data.seeded} προεπιλεγμένα στοιχεία`);
      load();
    } catch { toast.error('Σφάλμα'); } finally { setSeeding(false); }
  };

  const active   = items.filter(i => i.is_active);
  const inactive = items.filter(i => !i.is_active);
  const activeTab = LIST_TYPES.find(t => t.key === activeType);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Λίστες & Ρυθμίσεις</h1>
          <p className="page-sub">Διαχείριση dropdown επιλογών</p>
        </div>
        <button onClick={seedDefaults} disabled={seeding} className="btn-secondary">
          {seeding ? 'Φόρτωση...' : '↺ Φόρτωση Προεπιλεγμένων'}
        </button>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2 flex-wrap">
        {LIST_TYPES.map(t => (
          <button key={t.key} onClick={() => setActiveType(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150
              ${activeType === t.key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 shadow-card'
              }`}>
            <span className={`w-2 h-2 rounded-full ${t.color}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Add new */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">
            Προσθήκη σε: <span className="text-primary-600">{activeTab?.label}</span>
            <span className="ml-2 text-slate-400 font-normal text-sm">({active.length} ενεργά)</span>
          </h3>
          <button onClick={() => setShowBulk(v => !v)}
            className={`btn-sm ${showBulk ? 'btn-primary' : 'btn-secondary'}`}>
            {showBulk ? '✕ Κλείσιμο' : '⊞ Μαζική Εισαγωγή'}
          </button>
        </div>

        {/* Single add */}
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Νέο στοιχείο…"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSingle()}
          />
          <button className="btn-primary" onClick={addSingle}>+ Προσθήκη</button>
        </div>

        {/* Bulk add */}
        {showBulk && (
          <div className="space-y-3 animate-slide-up">
            <div className="p-3 rounded-xl bg-primary-50 border border-primary-100 text-xs text-primary-700">
              Επικολλήστε πολλά στοιχεία, <strong>ένα ανά γραμμή</strong>. Μπορείτε να κάνετε copy-paste από Excel ή Google Sheets.
            </div>
            <textarea
              className="input h-40 font-mono text-xs resize-none"
              placeholder={"ΣΤΟΙΧΕΙΟ 1\nΣΤΟΙΧΕΙΟ 2\nΣΤΟΙΧΕΙΟ 3\n..."}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {bulkText.split('\n').filter(l => l.trim()).length} στοιχεία έτοιμα
              </span>
              <button className="btn-primary" onClick={addBulk}>
                ⊕ Εισαγωγή Όλων
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active / Inactive split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Active */}
        <div className="card p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Ενεργά
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{active.length}</span>
          </h3>
          <div className="space-y-0.5 max-h-[480px] overflow-y-auto -mx-1 px-1">
            {active.map(item => (
              <div key={item.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50 group transition-colors">
                <span className="text-sm text-slate-700">{item.value}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleActive(item)}
                    className="px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                    Απενεργ.
                  </button>
                  <button onClick={() => deleteItem(item.id)}
                    className="px-2 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {active.length === 0 && (
              <div className="text-slate-400 text-sm text-center py-8">Δεν υπάρχουν ενεργά στοιχεία</div>
            )}
          </div>
        </div>

        {/* Inactive */}
        <div className="card p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
            Ανενεργά
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{inactive.length}</span>
          </h3>
          <p className="text-xs text-slate-400 mb-3 bg-slate-50 rounded-lg p-2">
            Δεν εμφανίζονται στα dropdowns νέων εγγραφών.
          </p>
          <div className="space-y-0.5 max-h-[440px] overflow-y-auto -mx-1 px-1">
            {inactive.map(item => (
              <div key={item.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50 group transition-colors">
                <span className="text-sm text-slate-400">{item.value}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleActive(item)}
                    className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                    Ενεργοπ.
                  </button>
                  <button onClick={() => deleteItem(item.id)}
                    className="px-2 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {inactive.length === 0 && (
              <div className="text-slate-400 text-sm text-center py-8">Δεν υπάρχουν ανενεργά</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
