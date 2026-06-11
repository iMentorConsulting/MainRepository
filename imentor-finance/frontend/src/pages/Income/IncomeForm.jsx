import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import toast from 'react-hot-toast';
import CustomerSearch from '../../components/CustomerSearch';

const TARGETING_OPTS = ['ΑΙΤΗΣΗ', 'ΥΛΟΠΟΙΗΣΗ', 'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ', 'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ'];

const SectionTitle = ({ children }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="text-xs font-bold uppercase tracking-widest text-primary-500">{children}</span>
    <div className="flex-1 h-px bg-slate-100" />
  </div>
);

export default function IncomeForm({ record, onSave, onCancel }) {
  const [lists, setLists] = useState({});
  const [descTemplates, setDescTemplates] = useState([]);
  const [customerLinked, setCustomerLinked] = useState(false);
  const [autoTargeting, setAutoTargeting] = useState(true);
  const [afmLoading, setAfmLoading] = useState(false);
  const [descFree, setDescFree] = useState(false);

  // Agreement state
  const [customerAgreements, setCustomerAgreements] = useState([]);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [selectedAgreementId, setSelectedAgreementId] = useState(record?.service_agreement_id ? String(record.service_agreement_id) : '');
  const [showNewAgreementForm, setShowNewAgreementForm] = useState(false);
  const [newSA, setNewSA] = useState({ service_type: '', amount_application: '', amount_implementation: '' });

  const { register, handleSubmit, watch, setValue, getValues } = useForm({ defaultValues: record || {} });

  useEffect(() => {
    const types = ['ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ', 'ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ', 'ΠΗΓΗ_ΣΥΣΤΑΣΗ', 'ΠΡΑΚΤΟΡΕΣ'];
    Promise.all(types.map(t => api.get(`/lists?list_type=${t}&active_only=true`)))
      .then(results => {
        const l = {};
        types.forEach((t, i) => { l[t] = results[i].data.map(x => x.value); });
        setLists(l);
      });
    api.get('/lists', { params: { list_type: 'description_templates', active_only: 'true' } })
      .then(r => setDescTemplates(r.data.map(x => x.value)));
  }, []);




  // Load agreements when customer_name changes
  const customerName = watch('customer_name');
  useEffect(() => {
    if (!customerName || customerName.length < 2) { setCustomerAgreements([]); return; }
    setLoadingAgreements(true);
    api.get('/service-agreements', { params: { customer_name: customerName, limit: 100 } })
      .then(r => setCustomerAgreements(r.data.data || []))
      .catch(() => setCustomerAgreements([]))
      .finally(() => setLoadingAgreements(false));
  }, [customerName]);

  const handleAadeSearch = async () => {
    const vat = watch('vat_number')?.trim();
    if (!vat || !/^\d{9}$/.test(vat)) { toast.error('Συμπληρώστε ΑΦΜ 9 ψηφίων'); return; }
    setAfmLoading(true);
    try {
      const r = await api.get(`/customers/search-afm?vat=${vat}`);
      const d = r.data;
      if (d.error) { toast.error(d.error); return; }
      if (d.name) setValue('customer_name', d.name);
      if (d.address) setValue('address', d.address);
      if (d.city) setValue('city', d.city);
      if (d.postal_code) setValue('postal_code', d.postal_code);
      if (d.activity) setValue('business_activity', d.activity);
      toast.success('Στοιχεία ΑΑΔΕ συμπληρώθηκαν');
    } catch (e) { toast.error(e.response?.data?.error || 'Σφάλμα ΑΑΔΕ'); }
    finally { setAfmLoading(false); }
  };

  const handleCustomerSelect = c => {
    if (!c) {
      setCustomerLinked(false);
      return;
    }
    if (c._new) {
      setValue('customer_name', c.name);
      setCustomerLinked(false);
      return;
    }
    setValue('customer_name', c.name);
    if (c.vat_number) setValue('vat_number', c.vat_number);
    if (c.email) setValue('email', c.email);
    if (c.phone) setValue('phone', c.phone);
    if (c.city) setValue('city', c.city);
    if (c.postal_code) setValue('postal_code', c.postal_code);
    if (c.address) setValue('address', c.address);
    if (c.business_activity) setValue('business_activity', c.business_activity);
    if (c.accountant) setValue('accountant', c.accountant);
    if (c.accountant_email) setValue('accountant_email', c.accountant_email);
    if (c.id) setValue('customer_id', c.id);
    setValue('service_agreement_id', '');
    setSelectedAgreementId('');
    setCustomerAgreements([]);
    setCustomerLinked(true);
  };

  const handleCreateAgreement = async () => {
    try {
      const customerNameVal = watch('customer_name');
      const customerId = watch('customer_id');
      const res = await api.post('/service-agreements', {
        customer_name: customerNameVal,
        customer_id: customerId || undefined,
        service_type: newSA.service_type,
        amount_application: newSA.amount_application || undefined,
        amount_implementation: newSA.amount_implementation || undefined,
        status: 'ΕΝ ΕΞΕΛΙΞΕΙ'
      });
      const created = res.data;
      setCustomerAgreements(prev => [...prev, created]);
      setSelectedAgreementId(String(created.id));
      setValue('service_agreement_id', String(created.id));
      setValue('service_type', created.service_type);
      if (created.amount_application) setValue('amount_application', created.amount_application);
      setShowNewAgreementForm(false);
      setNewSA({ service_type: '', amount_application: '', amount_implementation: '' });
      toast.success('Νέα συμφωνία δημιουργήθηκε!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Σφάλμα δημιουργίας συμφωνίας');
    }
  };

  const onSubmit = async data => {
    try {
      if (!customerLinked && !record?.id && data.customer_name) {
        try {
          const custRes = await api.post('/customers', {
            name: data.customer_name,
            vat_number: data.vat_number || undefined,
            email: data.email || undefined,
            phone: data.phone || undefined,
            city: data.city || undefined,
            postal_code: data.postal_code || undefined,
            address: data.address || undefined,
            business_activity: data.business_activity || undefined,
            accountant: data.accountant || undefined,
            accountant_email: data.accountant_email || undefined,
          });
          if (custRes.data?.id) data.customer_id = custRes.data.id;
        } catch (err) {
          console.error('Customer auto-create failed:', err);
        }
      }
      if (record?.id) await api.put(`/income/${record.id}`, data);
      else await api.post('/income', data);
      toast.success(record?.id ? 'Ενημερώθηκε!' : 'Καταχωρήθηκε!');
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα');
    }
  };

  const F = ({ label, name, type = 'text', required = false, extra = {} }) => (
    <div>
      <label className="label">{label}{required && <span className="text-rose-500 ml-1">*</span>}</label>
      <input type={type} className="input" {...register(name)} {...extra} />
    </div>
  );

  const S = ({ label, name, opts, required = false }) => (
    <div>
      <label className="label">{label}{required && <span className="text-rose-500 ml-1">*</span>}</label>
      <select className="input" {...register(name)}>
        <option value="">— Επιλογή —</option>
        {opts?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <SectionTitle>Στοιχεία Πελάτη</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Αναζήτηση Πελάτη</label>
            <CustomerSearch
              value={record?.customer_name || ''}
              onSelect={handleCustomerSelect}
            />
            {customerLinked && (
              <p className="text-xs text-green-600 mt-1">Πελάτης συνδέθηκε από βάση δεδομένων</p>
            )}
          </div>
          <F label="Επωνυμία *" name="customer_name" required />
          <F label="Email" name="email" type="email" />
          <F label="Κινητό" name="phone" type="tel" />
          <F label="Πόλη / Περιφέρεια" name="city" />
          <F label="Τ.Κ." name="postal_code" />
          <F label="Διεύθυνση" name="address" />
          <div>
            <label className="label">ΑΦΜ</label>
            <div className="flex gap-2">
              <input type="text" className="input flex-1" {...register('vat_number')} placeholder="9 ψηφία" />
              <button
                type="button"
                onClick={handleAadeSearch}
                disabled={afmLoading}
                className="btn-secondary text-xs px-3 whitespace-nowrap"
              >
                {afmLoading ? '...' : '🔍 ΑΑΔΕ'}
              </button>
            </div>
          </div>
          <F label="Αντικείμενο" name="business_activity" />
          <F label="Λογιστής" name="accountant" />
          <F label="Email Λογιστή" name="accountant_email" type="email" />
        </div>
      </div>

      <div>
        <SectionTitle>Οικονομικά Στοιχεία</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Ποσό Αίτησης (€)</label>
            <input type="number" step="0.01" className="input"
              {...register('amount_application', {
                onChange: e => {
                  const app = parseFloat(e.target.value);
                  if (!isNaN(app) && app > 0) setValue('bonus', (app * 0.05).toFixed(2));
                  if (autoTargeting) {
                    const impl = parseFloat(getValues('amount_implementation'));
                    if (impl > 0) setValue('targeting_category', 'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ');
                    else if (app > 0) setValue('targeting_category', 'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ');
                  }
                }
              })}
            />
          </div>
          <div>
            <label className="label">Ποσό Υλοποίησης (€)</label>
            <input type="number" step="0.01" className="input"
              {...register('amount_implementation', {
                onChange: e => {
                  if (!autoTargeting) return;
                  const impl = parseFloat(e.target.value);
                  const app = parseFloat(getValues('amount_application'));
                  if (impl > 0) setValue('targeting_category', 'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ');
                  else if (app > 0) setValue('targeting_category', 'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ');
                }
              })}
            />
          </div>
          <F label="Ύψος Επένδυσης (€)" name="investment_height" type="number" extra={{ step: '0.01' }} />
          <F label="Σύνολο Οφειλών (€)" name="total_debts" type="number" extra={{ step: '0.01' }} />
          <div>
            <label className="label">Ποσό Είσπραξης (€)<span className="text-rose-500 ml-1">*</span></label>
            <input type="number" step="0.01" className="input" required
              {...register('amount_collected', {
                onChange: e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) setValue('vat_amount', (v * 0.24).toFixed(2));
                }
              })}
            />
          </div>
          <F label="ΦΠΑ (€)" name="vat_amount" type="number" extra={{ step: '0.01' }} />
          <div>
            <label className="label">Κατηγορία Στοχοθεσίας</label>
            <select className="input" {...register('targeting_category')} onChange={e => { setAutoTargeting(false); setValue('targeting_category', e.target.value); }}>
              <option value="">— Επιλογή —</option>
              {TARGETING_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Στοιχεία Πώλησης</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Agreement selection */}
          <div className="col-span-2">
            <label className="label">Συμφωνία Πελάτη</label>
            {loadingAgreements ? (
              <div className="text-sm text-slate-400">Φόρτωση συμφωνιών...</div>
            ) : (
              <select
                className="input"
                value={selectedAgreementId || ''}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setShowNewAgreementForm(true);
                    setSelectedAgreementId('');
                  } else {
                    setShowNewAgreementForm(false);
                    const sa = customerAgreements.find(a => String(a.id) === e.target.value);
                    setSelectedAgreementId(e.target.value);
                    setValue('service_agreement_id', e.target.value);
                    if (sa) {
                      if (sa.service_type) setValue('service_type', sa.service_type);
                      if (sa.amount_application) setValue('amount_application', sa.amount_application);
                      if (sa.investment_height) setValue('investment_height', sa.investment_height);
                    }
                  }
                }}
              >
                <option value="">— Επιλέξτε Συμφωνία —</option>
                <option value="__new__">➕ Νέα Συμφωνία</option>
                {customerAgreements.map(a => (
                  <option key={a.id} value={String(a.id)}>
                    {a.service_type || 'Χωρίς τύπο'} · {a.status} · {a.amount_application ? Number(a.amount_application).toLocaleString('el-GR') + '€' : '—'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {showNewAgreementForm && (
            <div className="col-span-2 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <p className="text-sm font-semibold text-blue-700">Νέα Συμφωνία</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Είδος Υπηρεσίας *</label>
                  <select className="input" value={newSA.service_type || ''} onChange={e => setNewSA(f => ({...f, service_type: e.target.value}))}>
                    <option value="">— Επιλογή —</option>
                    {(lists['ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ'] || []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Ποσό Αίτησης (€)</label>
                  <input type="number" className="input" value={newSA.amount_application || ''} onChange={e => setNewSA(f => ({...f, amount_application: e.target.value}))} />
                </div>
                <div>
                  <label className="label">Ποσό Υλοποίησης (€)</label>
                  <input type="number" className="input" value={newSA.amount_implementation || ''} onChange={e => setNewSA(f => ({...f, amount_implementation: e.target.value}))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary text-sm" onClick={handleCreateAgreement} disabled={!newSA.service_type}>Δημιουργία Συμφωνίας</button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setShowNewAgreementForm(false)}>Ακύρωση</button>
              </div>
            </div>
          )}

          <input type="hidden" {...register('service_agreement_id')} />

          <S label="Κατάσταση Εργασίας" name="work_status" opts={lists['ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ']} />
          <S label="Είδος Υπηρεσίας" name="service_type" opts={lists['ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ']} required />
          <S label="Πηγή / Σύσταση" name="source_referral" opts={lists['ΠΗΓΗ_ΣΥΣΤΑΣΗ']} />
          <S label="Υπεύθυνος Πώλησης" name="sales_agent" opts={lists['ΠΡΑΚΤΟΡΕΣ']} />
          <S label="Υπεύθυνος Φακέλου" name="folder_agent" opts={lists['ΠΡΑΚΤΟΡΕΣ']} />
          <F label="Bonus (€)" name="bonus" type="number" extra={{ step: '0.01' }} />
          <F label="Ημ/νία Πώλησης / Είσπραξης" name="sale_date" type="date" required />
          <F label="Ημ/νία Έγκρισης / Απόρριψης" name="approval_date" type="date" />
          <F label="Προθεσμία Ολοκλήρωσης" name="completion_deadline" type="date" />
        </div>
        <div className="mt-4">
          <label className="label">Αιτιολογία – Περιγραφή</label>
          <select
            className="input mb-2"
            value={descFree ? '__free__' : (watch('description') || '')}
            onChange={e => {
              if (e.target.value === '__free__') {
                setDescFree(true);
                setValue('description', '');
              } else {
                setDescFree(false);
                setValue('description', e.target.value);
              }
            }}
          >
            <option value="">— Επιλογή αιτιολογίας —</option>
            {descTemplates.map((t, i) => <option key={i} value={t}>{t}</option>)}
            <option value="__free__">✏️ Ελεύθερο κείμενο</option>
          </select>
          {descFree && (
            <textarea className="input h-20 resize-none" {...register('description')} placeholder="Πληκτρολογήστε αιτιολογία..." />
          )}
        </div>
      </div>

      <div>
        <SectionTitle>Τιμολόγιο</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <F label="Αρ. Τιμολογίου" name="invoice_number" />
        </div>
        <label className="flex items-center gap-2.5 mt-4 cursor-pointer group">
          <div className="relative">
            <input type="checkbox" id="unsubscribe" {...register('unsubscribe')} className="sr-only peer" />
            <div className="w-4 h-4 rounded border-2 border-slate-300 peer-checked:bg-primary-600 peer-checked:border-primary-600 transition-all" />
          </div>
          <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">Unsubscribe από email/viber</span>
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button type="button" className="btn-secondary" onClick={onCancel}>Ακύρωση</button>
        <button type="submit" className="btn-primary">{record?.id ? 'Αποθήκευση' : 'Καταχώρηση'}</button>
      </div>
    </form>
  );
}
