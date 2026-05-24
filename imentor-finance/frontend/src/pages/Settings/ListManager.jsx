import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

const LIST_TYPES = [
  { key: 'ΚΑΤΗΓΟΡΙΕΣ_ΕΞΟΔΩΝ', label: 'Κατηγορίες Εξόδων' },
  { key: 'ΠΡΟΜΗΘΕΥΤΕΣ', label: 'Προμηθευτές / Υπάλληλοι' },
  { key: 'ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ', label: 'Κατάσταση Εργασίας' },
  { key: 'ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ', label: 'Είδος Υπηρεσίας' },
  { key: 'ΠΗΓΗ_ΣΥΣΤΑΣΗ', label: 'Πηγή / Σύσταση' },
  { key: 'ΠΡΑΚΤΟΡΕΣ', label: 'Πράκτορες' },
];

export default function ListManager() {
  const [activeType, setActiveType] = useState(LIST_TYPES[0].key);
  const [items, setItems] = useState([]);
  const [newValue, setNewValue] = useState('');
  const [seeding, setSeeding] = useState(false);

  const load = () => {
    api.get(`/lists?list_type=${activeType}`).then(r => setItems(r.data));
  };

  useEffect(() => { load(); }, [activeType]);

  const toggleActive = async item => {
    try {
      await api.put(`/lists/${item.id}`, { is_active: !item.is_active });
      load();
    } catch { toast.error('Σφάλμα'); }
  };

  const addItem = async () => {
    if (!newValue.trim()) return;
    try {
      await api.post('/lists', { list_type: activeType, value: newValue.trim(), is_active: true });
      toast.success('Προστέθηκε!');
      setNewValue('');
      load();
    } catch { toast.error('Σφάλμα'); }
  };

  const deleteItem = async id => {
    try {
      await api.delete(`/lists/${id}`);
      load();
    } catch { toast.error('Σφάλμα διαγραφής'); }
  };

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const r = await api.post('/lists/seed');
      toast.success(`Προστέθηκαν ${r.data.seeded} προεπιλεγμένα στοιχεία`);
      load();
    } catch { toast.error('Σφάλμα'); } finally { setSeeding(false); }
  };

  const active = items.filter(i => i.is_active);
  const inactive = items.filter(i => !i.is_active);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Λίστες & Ρυθμίσεις</h1>
        <button className="btn-secondary" onClick={seedDefaults} disabled={seeding}>
          {seeding ? 'Φόρτωση...' : '🔄 Φόρτωση Προεπιλεγμένων'}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {LIST_TYPES.map(t => (
          <button key={t.key} onClick={() => setActiveType(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeType === t.key ? 'bg-primary-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active items */}
        <div className="card">
          <h2 className="font-semibold mb-3 text-green-700">✅ Ενεργά ({active.length})</h2>
          <div className="flex gap-2 mb-4">
            <input className="input flex-1" placeholder="Νέο στοιχείο…" value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()} />
            <button className="btn-primary" onClick={addItem}>+ Προσθήκη</button>
          </div>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {active.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group">
                <span className="text-sm">{item.value}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleActive(item)} className="text-xs text-orange-500 hover:text-orange-700 px-2 py-1 rounded bg-orange-50">
                    Απενεργοποίηση
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded bg-red-50">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {active.length === 0 && <div className="text-gray-400 text-sm text-center py-4">Δεν υπάρχουν ενεργά στοιχεία</div>}
          </div>
        </div>

        {/* Inactive items */}
        <div className="card">
          <h2 className="font-semibold mb-3 text-gray-500">⚪ Ανενεργά ({inactive.length})</h2>
          <p className="text-xs text-gray-400 mb-3">Αυτά δεν εμφανίζονται στα dropdowns νέων εγγραφών.</p>
          <div className="space-y-1 max-h-[540px] overflow-y-auto">
            {inactive.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group">
                <span className="text-sm text-gray-400">{item.value}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleActive(item)} className="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded bg-green-50">
                    Ενεργοποίηση
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded bg-red-50">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {inactive.length === 0 && <div className="text-gray-400 text-sm text-center py-4">Δεν υπάρχουν ανενεργά στοιχεία</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
