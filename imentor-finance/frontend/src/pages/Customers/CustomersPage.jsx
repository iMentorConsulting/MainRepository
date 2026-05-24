import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = (path, opts = {}) =>
  axios({ url: `/api${path}`, headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, ...opts });

const EMPTY_FORM = {
  name: '',
  vat_number: '',
  email: '',
  phone: '',
  city: '',
  postal_code: '',
  address: '',
  business_activity: '',
  accountant: '',
  accountant_email: '',
  notes: '',
};

function CustomerModal({ customer, onSave, onCancel }) {
  const [form, setForm] = useState(customer ? { ...customer } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [afmLoading, setAfmLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAfmSearch = async () => {
    if (!form.vat_number?.trim()) return toast.error('Εισάγετε ΑΦΜ');
    setAfmLoading(true);
    try {
      const r = await API(`/customers/search-afm?vat=${form.vat_number.trim()}`);
      const d = r.data;
      if (d.name) set('name', d.name);
      if (d.address) set('address', d.address);
      if (d.city) set('city', d.city);
      if (d.postal_code) set('postal_code', d.postal_code);
      if (d.business_activity) set('business_activity', d.business_activity);
      toast.success('Στοιχεία ΑΦΜ συμπληρώθηκαν');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Αποτυχία αναζήτησης ΑΦΜ');
    } finally {
      setAfmLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Το όνομα είναι υποχρεωτικό');
    setSaving(true);
    try {
      if (customer?.id) {
        await API(`/customers/${customer.id}`, { method: 'PUT', data: form });
        toast.success('Ο πελάτης ενημερώθηκε');
      } else {
        await API('/customers', { method: 'POST', data: form });
        toast.success('Ο πελάτης προστέθηκε');
      }
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα αποθήκευσης');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {customer?.id ? 'Επεξεργασία Πελάτη' : 'Νέος Πελάτης'}
          </h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Επωνυμία / Όνομα *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label">ΑΦΜ</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={form.vat_number} onChange={e => set('vat_number', e.target.value)} />
                <button type="button" className="btn-secondary whitespace-nowrap" onClick={handleAfmSearch} disabled={afmLoading}>
                  {afmLoading ? '...' : 'ΑΑΔΕ'}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="label">Τηλέφωνο</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Πόλη</label>
              <input className="input" value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div>
              <label className="label">Ταχυδρομικός Κώδικας</label>
              <input className="input" value={form.postal_code} onChange={e => set('postal_code', e.target.value)} />
            </div>
            <div>
              <label className="label">Διεύθυνση</label>
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div>
              <label className="label">Δραστηριότητα</label>
              <input className="input" value={form.business_activity} onChange={e => set('business_activity', e.target.value)} />
            </div>
            <div>
              <label className="label">Λογιστής</label>
              <input className="input" value={form.accountant} onChange={e => set('accountant', e.target.value)} />
            </div>
            <div>
              <label className="label">Email Λογιστή</label>
              <input type="email" className="input" value={form.accountant_email} onChange={e => set('accountant_email', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Σημειώσεις</label>
              <textarea className="input h-20 resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button className="btn-secondary" onClick={onCancel}>Ακύρωση</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Αποθήκευση...' : customer?.id ? 'Ενημέρωση' : 'Προσθήκη'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [modal, setModal] = useState(null); // null | 'add' | { edit: customer } | { delete: customer }
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async (p = page, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      params.set('page', p);
      const r = await API(`/customers?${params}`);
      const data = r.data;
      if (Array.isArray(data)) {
        setCustomers(data);
        setTotalPages(1);
      } else {
        setCustomers(data.customers || data.rows || []);
        setTotalPages(data.pages || data.totalPages || 1);
      }
    } catch (e) {
      toast.error('Σφάλμα φόρτωσης πελατών');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load(1, search);
    setPage(1);
  }, [search]);

  useEffect(() => {
    load(page, search);
  }, [page]);

  const handleDelete = async (customer) => {
    try {
      await API(`/customers/${customer.id}`, { method: 'DELETE' });
      toast.success('Ο πελάτης διαγράφηκε');
      setModal(null);
      load(page, search);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα διαγραφής');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await API('/import/sync-customers', { method: 'POST' });
      toast.success(r.data.message || 'Συγχρονισμός ολοκληρώθηκε');
      load(1, search);
      setPage(1);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα συγχρονισμού');
    } finally {
      setSyncing(false);
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    const av = (a[sortKey] || '').toString().toLowerCase();
    const bv = (b[sortKey] || '').toString().toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span className="text-slate-300 ml-1">↕</span>;
    return <span className="text-indigo-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const ThSort = ({ col, children }) => (
    <th className="th cursor-pointer select-none hover:bg-slate-50" onClick={() => handleSort(col)}>
      {children}<SortIcon col={col} />
    </th>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Πελάτες</h1>
          <p className="text-sm text-slate-500 mt-0.5">Διαχείριση πελατολογίου</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? '⏳' : '🔄'} {syncing ? 'Συγχρονισμός...' : 'Συγχρονισμός από Εισοδήματα'}
          </button>
          <button className="btn-primary" onClick={() => setModal('add')}>
            + Νέος Πελάτης
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="input max-w-sm"
          placeholder="Αναζήτηση (Όνομα, ΑΦΜ, Πόλη)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="text-sm text-slate-500">
          {loading ? 'Φόρτωση...' : `${customers.length} πελάτες`}
        </span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Φόρτωση...</div>
        ) : sortedCustomers.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            {search ? 'Δεν βρέθηκαν πελάτες για αυτή την αναζήτηση' : 'Δεν υπάρχουν πελάτες'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <ThSort col="name">Επωνυμία</ThSort>
                  <ThSort col="vat_number">ΑΦΜ</ThSort>
                  <ThSort col="email">Email</ThSort>
                  <ThSort col="phone">Τηλέφωνο</ThSort>
                  <ThSort col="city">Πόλη</ThSort>
                  <ThSort col="accountant">Λογιστής</ThSort>
                  <th className="th">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.map(c => (
                  <tr key={c.id} className="tr group">
                    <td className="td font-semibold text-slate-800">{c.name}</td>
                    <td className="td">
                      {c.vat_number ? (
                        <span className="badge-gray font-mono text-xs">{c.vat_number}</span>
                      ) : '—'}
                    </td>
                    <td className="td text-slate-600 text-sm">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="text-indigo-600 hover:underline">
                          {c.email}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="td text-slate-600 text-sm">{c.phone || '—'}</td>
                    <td className="td text-slate-600 text-sm">{c.city || '—'}</td>
                    <td className="td text-slate-600 text-sm">
                      {c.accountant ? (
                        <div>
                          <div>{c.accountant}</div>
                          {c.accountant_email && (
                            <div className="text-xs text-slate-400">{c.accountant_email}</div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="td">
                      <div className="flex gap-2">
                        <button
                          className="text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                          onClick={() => setModal({ edit: c })}
                        >
                          Επεξ.
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                          onClick={() => setModal({ delete: c })}
                        >
                          Διαγρ.
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            className="btn-secondary text-sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Προηγ.
          </button>
          <span className="text-sm text-slate-600">Σελίδα {page} / {totalPages}</span>
          <button
            className="btn-secondary text-sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Επόμ. →
          </button>
        </div>
      )}

      {(modal === 'add' || modal?.edit) && (
        <CustomerModal
          customer={modal?.edit || null}
          onSave={() => { setModal(null); load(page, search); }}
          onCancel={() => setModal(null)}
        />
      )}

      {modal?.delete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">Διαγραφή Πελάτη</h3>
            <p className="text-slate-600 text-sm">
              Είστε σίγουρος ότι θέλετε να διαγράψετε τον πελάτη{' '}
              <strong>{modal.delete.name}</strong>; Η ενέργεια δεν αναιρείται.
            </p>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button className="btn-secondary" onClick={() => setModal(null)}>Ακύρωση</button>
              <button
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                onClick={() => handleDelete(modal.delete)}
              >
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
