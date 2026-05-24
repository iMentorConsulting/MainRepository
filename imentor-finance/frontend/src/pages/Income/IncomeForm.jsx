import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import toast from 'react-hot-toast';

const TARGETING_OPTS = ['ΑΙΤΗΣΗ', 'ΥΛΟΠΟΙΗΣΗ'];

export default function IncomeForm({ record, onSave, onCancel }) {
  const [lists, setLists] = useState({});
  const { register, handleSubmit, watch, setValue, reset } = useForm({ defaultValues: record || {} });

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

  const field = (label, name, type = 'text', required = false, extra = {}) => (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <input type={type} className="input" {...register(name)} {...extra} />
    </div>
  );

  const select = (label, name, opts, required = false) => (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <select className="input" {...register(name)}>
        <option value="">— Επιλογή —</option>
        {opts?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <fieldset className="border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold px-2 text-primary-700">Στοιχεία Πελάτη</legend>
        <div className="grid grid-cols-2 gap-4">
          {field('Επωνυμία Πελάτη', 'customer_name', 'text', true)}
          {select('Κατάσταση Εργασίας', 'work_status', lists['ΚΑΤΑΣΤΑΣΗ_ΕΡΓΑΣΙΑΣ'])}
          {field('Email', 'email', 'email')}
          {field('Κινητό', 'phone', 'tel')}
          {field('Πόλη / Περιφέρεια', 'city')}
          {field('Τ.Κ.', 'postal_code')}
          {field('Διεύθυνση', 'address')}
          {field('ΑΦΜ', 'vat_number')}
          {field('Αντικείμενο', 'business_activity')}
          {field('Λογιστής', 'accountant')}
          {field('Email Λογιστή', 'accountant_email', 'email')}
        </div>
      </fieldset>

      <fieldset className="border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold px-2 text-primary-700">Οικονομικά Στοιχεία</legend>
        <div className="grid grid-cols-2 gap-4">
          {field('Ποσό για Αίτηση (€)', 'amount_application', 'number')}
          {field('Ποσό για Υλοποίηση (€)', 'amount_implementation', 'number')}
          {field('Ύψος Επένδυσης (€)', 'investment_height', 'number')}
          {field('Σύνολο Οφειλών (€)', 'total_debts', 'number')}
          {field('Ποσό Είσπραξης (€)', 'amount_collected', 'number', true)}
          {field('ΦΠΑ (€)', 'vat_amount', 'number')}
          {select('Κατηγορία Στοχοθεσίας', 'targeting_category', TARGETING_OPTS)}
        </div>
      </fieldset>

      <fieldset className="border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold px-2 text-primary-700">Στοιχεία Πώλησης</legend>
        <div className="grid grid-cols-2 gap-4">
          {select('Είδος Υπηρεσίας', 'service_type', lists['ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ'], true)}
          {select('Πηγή / Σύσταση', 'source_referral', lists['ΠΗΓΗ_ΣΥΣΤΑΣΗ'])}
          {select('Υπεύθυνος Πώλησης', 'sales_agent', lists['ΠΡΑΚΤΟΡΕΣ'])}
          {select('Υπεύθυνος Φακέλου', 'folder_agent', lists['ΠΡΑΚΤΟΡΕΣ'])}
          {field('Bonus (€)', 'bonus', 'number')}
          {field('Ημ/νία Πώλησης / Είσπραξης', 'sale_date', 'date', true)}
          {field('Ημ/νία Έγκρισης / Απόρριψης', 'approval_date', 'date')}
          {field('Προθεσμία Ολοκλήρωσης', 'completion_deadline', 'date')}
        </div>
        <div>
          <label className="label">Αιτιολογία – Περιγραφή</label>
          <textarea className="input h-20" {...register('description')} />
        </div>
      </fieldset>

      <fieldset className="border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold px-2 text-primary-700">Τιμολόγιο</legend>
        <div className="grid grid-cols-2 gap-4">
          {field('Αρ. Τιμολογίου (Νο.xxx / ΗΗ-ΜΜ-ΕΕΕΕ)', 'invoice_number')}
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="unsubscribe" {...register('unsubscribe')} className="w-4 h-4" />
          <label htmlFor="unsubscribe" className="text-sm">Unsubscribe από email/viber</label>
        </div>
      </fieldset>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Ακύρωση</button>
        <button type="submit" className="btn-primary">{record?.id ? 'Αποθήκευση' : 'Καταχώρηση'}</button>
      </div>
    </form>
  );
}
