import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function ExpensesForm({ record, onSave, onCancel }) {
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [services, setServices] = useState([]);
  const { register, handleSubmit, reset } = useForm({ defaultValues: record || {} });

  useEffect(() => {
    Promise.all([
      api.get('/lists?list_type=ΚΑΤΗΓΟΡΙΕΣ_ΕΞΟΔΩΝ&active_only=true').then(r => setCategories(r.data.map(x => x.value))),
      api.get('/lists?list_type=ΠΡΟΜΗΘΕΥΤΕΣ&active_only=true').then(r => setSuppliers(r.data.map(x => x.value))),
      api.get('/lists?list_type=ΕΙΔΟΣ_ΥΠΗΡΕΣΙΑΣ&active_only=true').then(r => setServices(r.data.map(x => x.value))),
    ]).then(() => {
      if (record) reset(record);
    });
  }, []);

  const onSubmit = async data => {
    try {
      if (record?.id) await api.put(`/expenses/${record.id}`, data);
      else await api.post('/expenses', data);
      toast.success(record?.id ? 'Ενημερώθηκε!' : 'Καταχωρήθηκε!');
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Σφάλμα');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Ημερομηνία <span className="text-rose-500">*</span></label>
          <input type="date" className="input" {...register('date', { required: true })} />
        </div>
        <div>
          <label className="label">Ποσό (€) <span className="text-rose-500">*</span></label>
          <input type="number" step="0.01" className="input" placeholder="0.00" {...register('amount', { required: true })} />
        </div>
        <div>
          <label className="label">Κατηγορία Εξόδου</label>
          <select className="input" {...register('category')}>
            <option value="">— Επιλογή —</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Προμηθευτής / Υπάλληλος</label>
          <select className="input" {...register('supplier')}>
            <option value="">— Επιλογή —</option>
            {suppliers.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Αφορά Υπηρεσία</label>
          <select className="input" {...register('related_service')}>
            <option value="">— Επιλογή —</option>
            {services.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Αιτιολογία – Περιγραφή</label>
        <textarea className="input h-20 resize-none" {...register('description')} />
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button type="button" className="btn-secondary" onClick={onCancel}>Ακύρωση</button>
        <button type="submit" className="btn-primary">{record?.id ? 'Αποθήκευση' : 'Καταχώρηση'}</button>
      </div>
    </form>
  );
}
