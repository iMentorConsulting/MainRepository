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
  const [customerLinked, setCustomerLinked] = useState(false);
  const [autoTargeting, setAutoTargeting] = useState(true);
  const { register, handleSubmit, watch, setValue } = useForm({ defaultValues: record || {} });

  useEffect(() => {
    const types = ['ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ', 'ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ', 'ΠΗΓΗ_ΣΥΣΤΑΣΗ', 'ΠΡΑΚΤΟΡΕΣ'];
    Promise.all(types.map(t => api.get(`/lists?list_type=${t}&active_only=true`)))
      .then(results => {
        const l = {};
        types.forEach((t, i) => { l[t] = results[i].data.map(x => x.value); });
        setLists(l);
      });
  }, []);

  const amountApp = watch('amount_application');
  useEffect(() => {
    if (amountApp) setValue('bonus', (parseFloat(amountApp) * 0.05).toFixed(2));
  }, [amountApp]);

  const amountCollected = watch('amount_collected');
  useEffect(() => {
    if (amountCollected) setValue('vat_amount', (parseFloat(amountCollected) * 0.24).toFixed(2));
  }, [amountCollected]);

  const amountImpl = watch('amount_implementation');
  useEffect(() => {
    if (!autoTargeting) return;
    const impl = parseFloat(amountImpl);
    const app = parseFloat(amountApp);
    if (impl > 0) {
      setValue('targeting_category', 'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ');
    } else if (app > 0 && !(impl > 0)) {
      setValue('targeting_category', 'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ');
    }
  }, [amountImpl, amountApp]);

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
    setCustomerLinked(true);
  };

  const onSubmit = async data => {
    try {
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
        <div className="grid grid-cols-2 gap-4">
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
          <S label="Κατάσταση Εργασίας" name="work_status" opts={lists['ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ']} />
          <F label="Email" name="email" type="email" />
          <F label="Κινητό" name="phone" type="tel" />
          <F label="Πόλη / Περιφέρεια" name="city" />
          <F label="Τ.Κ." name="postal_code" />
          <F label="Διεύθυνση" name="address" />
          <F label="ΑΦΜ" name="vat_number" />
          <F label="Αντικείμενο" name="business_activity" />
          <F label="Λογιστής" name="accountant" />
          <F label="Email Λογιστή" name="accountant_email" type="email" />
        </div>
      </div>

      <div>
        <SectionTitle>Οικονομικά Στοιχεία</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <F label="Ποσό Αίτησης (€)" name="amount_application" type="number" />
          <F label="Ποσό Υλοποίησης (€)" name="amount_implementation" type="number" />
          <F label="Ύψος Επένδυσης (€)" name="investment_height" type="number" />
          <F label="Σύνολο Οφειλών (€)" name="total_debts" type="number" />
          <F label="Ποσό Είσπραξης (€)" name="amount_collected" type="number" required />
          <F label="ΦΠΑ (€)" name="vat_amount" type="number" />
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
        <div className="grid grid-cols-2 gap-4">
          <S label="Είδος Υπηρεσίας" name="service_type" opts={lists['ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ']} required />
          <S label="Πηγή / Σύσταση" name="source_referral" opts={lists['ΠΗΓΗ_ΣΥΣΤΑΣΗ']} />
          <S label="Υπεύθυνος Πώλησης" name="sales_agent" opts={lists['ΠΡΑΚΤΟΡΕΣ']} />
          <S label="Υπεύθυνος Φακέλου" name="folder_agent" opts={lists['ΠΡΑΚΤΟΡΕΣ']} />
          <F label="Bonus (€)" name="bonus" type="number" />
          <F label="Ημ/νία Πώλησης / Είσπραξης" name="sale_date" type="date" required />
          <F label="Ημ/νία Έγκρισης / Απόρριψης" name="approval_date" type="date" />
          <F label="Προθεσμία Ολοκλήρωσης" name="completion_deadline" type="date" />
        </div>
        <div className="mt-4">
          <label className="label">Αιτιολογία – Περιγραφή</label>
          <textarea className="input h-20 resize-none" {...register('description')} />
        </div>
      </div>

      <div>
        <SectionTitle>Τιμολόγιο</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
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
