import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

const SOURCE_LABELS = {
  case_management: 'Case Mgmt',
  exodikastikos: 'Εξωδικαστικός',
};
const SOURCE_COLORS = {
  case_management: 'bg-blue-100 text-blue-800',
  exodikastikos:   'bg-purple-100 text-purple-800',
};
const STATUS_LABELS   = { pending: 'Αναμονή', converted: 'Μετατράπηκε', dismissed: 'Απορρίφθηκε' };
const STATUS_COLORS   = { pending: 'bg-amber-100 text-amber-800', converted: 'bg-green-100 text-green-800', dismissed: 'bg-slate-100 text-slate-600' };
const INV_TYPE_OPTS   = ['ΤΙΜΟΛΟΓΙΟ', 'ΑΠΟΔΕΙΞΗ', 'ΑΝΕΥ'];
const ORG_OPTS        = ['ΑΠΟΣΤΟΛΑΚΗΣ', 'I-MENTOR'];
const TARGET_OPTS     = ['ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ', 'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ'];

function Badge({ label, colorClass }) {
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>{label}</span>;
}

function Field({ label, value, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {children || <span className="text-sm text-slate-800 font-medium">{value || <span className="text-slate-400">—</span>}</span>}
    </div>
  );
}

function fmt(n) {
  if (n == null || n === '') return '—';
  return parseFloat(n).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
}

// ── Review / Convert Modal ────────────────────────────────────────────────────
function ReviewModal({ lead, onClose, onConverted, lists }) {
  const [form, setForm] = useState({
    sale_date:             lead.sale_date || new Date().toISOString().slice(0, 10),
    amount_collected:      lead.amount_collected ?? '',
    amount_application:    lead.amount_application ?? '',
    amount_implementation: lead.amount_implementation ?? '',
    service_type:          lead.service_type || '',
    targeting_category:    lead.targeting_category || '',
    work_status:           lead.work_status || '',
    description:           lead.description || '',
    organization:          lead.organization || '',
    invoice_type:          lead.invoice_type || '',
    service_agreement_id:  lead.suggested_sa?.id || '',
    sales_agent:           lead.sales_agent || '',
    source_referral:       lead.source_referral || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleConvert = async () => {
    setSaving(true);
    try {
      const body = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== '' && v != null) body[k] = v;
      }
      const r = await api.post(`/lead-intake/${lead.id}/convert`, body);
      toast.success('Εγγραφή εσόδου δημιουργήθηκε');
      onConverted(r.data.income_id);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα κατά τη μετατροπή');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-600">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/>
              </svg>
            </div>
            <div>
              <div className="font-bold text-slate-900 text-base">{lead.customer_name}</div>
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>ΑΦΜ {lead.vat_number || '—'}</span>
                {lead.source && <Badge label={SOURCE_LABELS[lead.source] || lead.source} colorClass={SOURCE_COLORS[lead.source] || 'bg-slate-100 text-slate-600'} />}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Customer info (read-only) */}
          <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3">
            <Field label="Πελάτης" value={lead.customer_name} />
            <Field label="ΑΦΜ" value={lead.vat_number} />
            <Field label="Τηλέφωνο" value={lead.phone} />
            <Field label="Email" value={lead.email} />
          </div>

          {/* SA suggestion */}
          {lead.suggested_sa && (
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600 mt-0.5 shrink-0">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
              </svg>
              <div>
                <span className="font-semibold text-green-800">Βρέθηκε Συμφωνία: </span>
                <span className="text-green-700">{lead.suggested_sa.service_type} — {lead.suggested_sa.status}</span>
                <div className="mt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-green-700">
                    <input type="checkbox"
                      checked={form.service_agreement_id === lead.suggested_sa.id}
                      onChange={e => set('service_agreement_id', e.target.checked ? lead.suggested_sa.id : '')}
                      className="rounded border-green-400 text-green-600" />
                    Σύνδεση με αυτή τη Συμφωνία
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ημ/νία Πώλησης</label>
              <input type="date" value={form.sale_date} onChange={e => set('sale_date', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Είδος Υπηρεσίας</label>
              <select value={form.service_type} onChange={e => set('service_type', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— επιλογή —</option>
                {(lists.ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ || []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Κατηγορία Στόχευσης</label>
              <select value={form.targeting_category} onChange={e => set('targeting_category', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— επιλογή —</option>
                {TARGET_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Κατάσταση Εργασίας</label>
              <select value={form.work_status} onChange={e => set('work_status', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— επιλογή —</option>
                {(lists.ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ || []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ποσό Εισπραχθέν (€)</label>
              <input type="number" step="0.01" value={form.amount_collected} onChange={e => set('amount_collected', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ποσό Αίτησης (€)</label>
              <input type="number" step="0.01" value={form.amount_application} onChange={e => set('amount_application', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ποσό Υλοποίησης (€)</label>
              <input type="number" step="0.01" value={form.amount_implementation} onChange={e => set('amount_implementation', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Τύπος Παραστατικού</label>
              <select value={form.invoice_type} onChange={e => set('invoice_type', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— επιλογή —</option>
                {INV_TYPE_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Οργανισμός</label>
              <select value={form.organization} onChange={e => set('organization', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— επιλογή —</option>
                {ORG_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Πράκτορας Πώλησης</label>
              <select value={form.sales_agent} onChange={e => set('sales_agent', e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— επιλογή —</option>
                {(lists.ΠΡΑΚΤΟΡΕΣ || []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Περιγραφή</label>
            <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
            Ακύρωση
          </button>
          <button onClick={handleConvert} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2">
            {saving && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4l3-3-3-3V4a10 10 0 1 0 10 10h-2a8 8 0 0 1-8 8 8 8 0 0 1-8-8z" className="opacity-75"/></svg>}
            Δημιουργία Εσόδου
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LeadIntakePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [reviewing, setReviewing] = useState(null); // lead with suggested_sa
  const [lists, setLists] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, listsRes] = await Promise.all([
        api.get('/lead-intake', { params: { status: showAll ? 'all' : 'pending' } }),
        Promise.all(['ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ','ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ','ΠΡΑΚΤΟΡΕΣ'].map(t =>
          api.get('/lists', { params: { list_type: t, active_only: true } })
        ))
      ]);
      setLeads(leadsRes.data);
      setLists({
        ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ: listsRes[0].data.map(x => x.value),
        ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ:   listsRes[1].data.map(x => x.value),
        ΠΡΑΚΤΟΡΕΣ:          listsRes[2].data.map(x => x.value),
      });
    } catch (e) {
      toast.error('Σφάλμα φόρτωσης leads');
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { load(); }, [load]);

  const openReview = async (lead) => {
    try {
      const r = await api.get(`/lead-intake/${lead.id}`);
      setReviewing(r.data);
    } catch {
      toast.error('Σφάλμα φόρτωσης');
    }
  };

  const handleDismiss = async (id) => {
    if (!confirm('Απόρριψη αυτού του lead;')) return;
    try {
      await api.post(`/lead-intake/${id}/dismiss`);
      toast.success('Απορρίφθηκε');
      load();
    } catch {
      toast.error('Σφάλμα');
    }
  };

  const pending = leads.filter(l => l.status === 'pending');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Εισερχόμενα Leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">Webhooks από Case Management & Εξωδικαστικός</p>
        </div>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {pending.length} αναμένουν
            </span>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600" />
            Εμφάνιση όλων
          </label>
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
            ↻ Ανανέωση
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">Φόρτωση…</div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 opacity-30">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3"/>
          </svg>
          <span className="text-sm">Δεν υπάρχουν leads</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Πελάτης</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Υπηρεσία</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Ποσό</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Ημ/νία</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Πηγή</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Κατάσταση</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map(lead => (
                  <tr key={lead.id} className={`hover:bg-slate-50/60 transition-colors ${lead.status !== 'pending' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 truncate max-w-[180px]">{lead.customer_name || '—'}</div>
                      <div className="text-xs text-slate-400">{lead.vat_number || ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="truncate max-w-[160px] text-slate-700">{lead.service_type || '—'}</div>
                      {lead.targeting_category && <div className="text-xs text-slate-400">{lead.targeting_category}</div>}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 tabular-nums">
                      {lead.amount_collected != null ? fmt(lead.amount_collected) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">
                      {lead.sale_date || lead.createdAt?.slice(0,10) || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {lead.source
                        ? <Badge label={SOURCE_LABELS[lead.source] || lead.source} colorClass={SOURCE_COLORS[lead.source] || 'bg-slate-100 text-slate-600'} />
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={STATUS_LABELS[lead.status] || lead.status} colorClass={STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'} />
                      {lead.status === 'converted' && lead.income_id && (
                        <div className="text-xs text-slate-400 mt-0.5">→ #{lead.income_id}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.status === 'pending' && (
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openReview(lead)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors whitespace-nowrap">
                            Δημιουργία Εσόδου
                          </button>
                          <button onClick={() => handleDismiss(lead.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors">
                            Απόρριψη
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewModal
          lead={reviewing}
          lists={lists}
          onClose={() => setReviewing(null)}
          onConverted={() => { setReviewing(null); load(); }}
        />
      )}
    </div>
  );
}
