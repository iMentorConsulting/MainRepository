import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../api/client';

const fmt = n => n?.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
const fmtPct = n => (n || 0).toFixed(1) + '%';
const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#64748b'];

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('');
  const [monthly, setMonthly] = useState([]);
  const [byService, setByService] = useState([]);
  const [byAgent, setByAgent] = useState([]);
  const [byExpCat, setByExpCat] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const q = month ? `year=${year}&month=${month}` : `year=${year}`;
    Promise.all([
      api.get(`/reports/monthly?year=${year}`),
      api.get(`/reports/by-service?${q}`),
      api.get(`/reports/by-agent?${q}`),
      api.get(`/reports/expenses-by-category?${q}`),
      api.get(`/reports/summary?${q}`)
    ]).then(([m, sv, ag, ec, sm]) => {
      setMonthly(m.data);
      setByService(sv.data);
      setByAgent(ag.data);
      setByExpCat(ec.data);
      setSummary(sm.data);
    });
  }, [year, month]);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const months = ['','01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthLabels = ['Όλοι','Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Αναφορές</h1>
        <select className="input w-32" value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
        <select className="input w-40" value={month} onChange={e => setMonth(e.target.value)}>
          {months.map((m,i) => <option key={m} value={m}>{monthLabels[i]}</option>)}
        </select>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card border-l-4 border-green-500 p-4">
            <div className="text-xs text-gray-500 uppercase font-semibold">Έσοδα</div>
            <div className="text-2xl font-bold">{fmt(summary.income)}</div>
          </div>
          <div className="card border-l-4 border-red-500 p-4">
            <div className="text-xs text-gray-500 uppercase font-semibold">Έξοδα</div>
            <div className="text-2xl font-bold">{fmt(summary.expenses)}</div>
          </div>
          <div className="card border-l-4 border-blue-500 p-4">
            <div className="text-xs text-gray-500 uppercase font-semibold">Κέρδος</div>
            <div className="text-2xl font-bold">{fmt(summary.profit)}</div>
          </div>
          <div className="card border-l-4 border-purple-500 p-4">
            <div className="text-xs text-gray-500 uppercase font-semibold">Περιθώριο</div>
            <div className="text-2xl font-bold">{fmtPct(summary.profit_pct)}</div>
          </div>
        </div>
      )}

      {/* Monthly trend */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Μηνιαία Εξέλιξη {year}</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month_name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => v.toLocaleString('el-GR')} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => v.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })} />
            <Legend />
            <Line type="monotone" dataKey="income" name="Έσοδα" stroke="#22c55e" strokeWidth={2} dot />
            <Line type="monotone" dataKey="expenses" name="Έξοδα" stroke="#ef4444" strokeWidth={2} dot />
            <Line type="monotone" dataKey="profit" name="Κέρδος" stroke="#3b82f6" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Service */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Έσοδα ανά Υπηρεσία</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byService.slice(0,10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={v => v.toLocaleString('el-GR')} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="service_type" width={150} tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => v.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })} />
              <Bar dataKey="income" name="Έσοδα" fill="#3b82f6" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expenses by category pie */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Έξοδα ανά Κατηγορία</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={byExpCat.slice(0,10)} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ category, percent }) => `${category?.slice(0,12)} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {byExpCat.slice(0,10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => v.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* By Agent table */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Αποτελέσματα ανά Πράκτορα</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Πράκτορας','Εγγραφές','Έσοδα','Bonus'].map(h => (
                  <th key={h} className="table-head table-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {byAgent.map((a, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{a.agent}</td>
                  <td className="table-cell">{a.count}</td>
                  <td className="table-cell font-semibold text-green-700">{fmt(a.income)}</td>
                  <td className="table-cell text-yellow-700">{fmt(a.bonus)}</td>
                </tr>
              ))}
              {byAgent.length === 0 && <tr><td colSpan={4} className="table-cell text-center text-gray-400 py-6">Δεν υπάρχουν δεδομένα</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
