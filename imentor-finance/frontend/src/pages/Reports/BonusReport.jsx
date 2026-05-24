import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../api/client';
import Modal from '../../components/Modal';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—';
const fmtFull = n => n != null && n !== '' ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const PALETTE = ['#6366f1','#10b981','#f59e0b','#f43f5e','#a855f7','#06b6d4'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-700 px-4 py-3 text-sm"
      style={{ background: '#1e1b4b', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
      <div className="text-slate-300 text-xs font-bold uppercase tracking-wide mb-2">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300 text-xs">{p.name}:</span>
          <span className="text-white font-bold text-xs">{Math.round(p.value).toLocaleString('el-GR')} €</span>
        </div>
      ))}
    </div>
  );
};

function DrilldownModal({ agent, month, monthName, year, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/income', { params: { year, month, sales_agent: agent, limit: 200 } })
      .then(r => setRecords(r.data.data))
      .finally(() => setLoading(false));
  }, [agent, month, year]);

  const totalBonus = records.reduce((s, r) => s + parseFloat(r.bonus || 0), 0);
  const totalApp = records.reduce((s, r) => s + parseFloat(r.amount_application || 0), 0);
  const totalCollected = records.reduce((s, r) => s + parseFloat(r.amount_collected || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(99,102,241,0.15)' }}>
        <div className="flex justify-between">
          <span className="text-slate-500">Σύμβουλος</span>
          <span className="font-bold text-slate-800">{agent}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Περίοδος</span>
          <span className="font-semibold text-slate-700">{monthName} {year}</span>
        </div>
        <div className="flex justify-between border-t border-indigo-100 pt-2 mt-1">
          <span className="text-slate-500">Σύνολο Bonus</span>
          <span className="font-black text-indigo-600">{fmtFull(totalBonus)}</span>
        </div>
        <div className="text-xs text-slate-400">
          Bonus = 5% × Ποσό Αίτησης · Σύνολο Αιτήσεων: {fmtFull(totalApp)} · Είσπραξη: {fmtFull(totalCollected)}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">Φόρτωση…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Ημ/νία','Πελάτης','Υπηρεσία','Ποσό Αίτησης','Είσπραξη','Bonus'].map(h => (
                  <th key={h} className="th text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="tr">
                  <td className="td text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.sale_date)}</td>
                  <td className="td font-medium text-slate-800 max-w-[180px]">
                    <div className="truncate">{r.customer_name}</div>
                  </td>
                  <td className="td text-xs text-slate-500 max-w-[140px]">
                    <div className="truncate">{r.service_type || '—'}</div>
                  </td>
                  <td className="td text-right text-xs font-medium text-slate-700 whitespace-nowrap">
                    {fmtFull(r.amount_application)}
                  </td>
                  <td className="td text-right font-semibold text-emerald-600 whitespace-nowrap">
                    {fmtFull(r.amount_collected)}
                  </td>
                  <td className="td text-right">
                    {r.bonus > 0
                      ? <span className="font-black text-indigo-600 whitespace-nowrap">{fmtFull(r.bonus)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={6} className="td text-center text-slate-400 py-6">Δεν βρέθηκαν εγγραφές</td></tr>
              )}
            </tbody>
            {records.length > 0 && (
              <tfoot>
                <tr className="bg-indigo-50">
                  <td colSpan={3} className="td font-bold text-slate-700 text-xs">Σύνολο ({records.length} εγγραφές)</td>
                  <td className="td text-right font-bold text-slate-700 text-xs whitespace-nowrap">{fmtFull(totalApp)}</td>
                  <td className="td text-right font-bold text-emerald-700 text-xs whitespace-nowrap">{fmtFull(totalCollected)}</td>
                  <td className="td text-right font-black text-indigo-700 whitespace-nowrap">{fmtFull(totalBonus)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button className="btn-secondary" onClick={onClose}>Κλείσιμο</button>
      </div>
    </div>
  );
}

export default function BonusReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState([]);
  const [drill, setDrill] = useState(null); // { agent, month, monthName }

  useEffect(() => {
    api.get(`/reports/bonus?year=${year}`).then(r => setData(r.data));
  }, [year]);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  const chartData = monthNames.map((name, i) => {
    const month = String(i + 1).padStart(2, '0');
    const row = { month: name };
    data.forEach(agent => {
      const m = agent.monthly.find(x => x.month === month);
      row[agent.agent] = m?.bonus || 0;
    });
    return row;
  });

  const grandTotal = data.reduce((s, a) => s + a.total, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bonus</h1>
          <p className="page-sub">Μηνιαία ανάλυση bonus ανά υπεύθυνο πώλησης</p>
        </div>
        <select className="input w-28" value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {data.map((agent, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}>
                  {(agent.agent || '?')[0]}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 truncate max-w-[120px]">{agent.agent}</div>
                  <div className="text-xs text-slate-400">Σύνολο {year}</div>
                </div>
              </div>
              <div className="text-xl font-black text-indigo-600">{fmt(agent.total)}</div>
            </div>
          ))}
          <div className="card p-4 border-2 border-indigo-100 bg-indigo-50/30">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Σύνολο</div>
            <div className="text-xl font-black text-indigo-700">{fmt(grandTotal)}</div>
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="section-title">Μηνιαίο Bonus ανά Σύμβουλο — {year}</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => v.toLocaleString('el-GR')} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
            {data.map((agent, i) => (
              <Bar key={agent.agent} dataKey={agent.agent} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} maxBarSize={40} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs text-slate-400">
          Κλικ σε κελί για ανάλυση πωλήσεων
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Σύμβουλος</th>
                {monthNames.map(m => <th key={m} className="th text-center">{m}</th>)}
                <th className="th text-right">Σύνολο</th>
              </tr>
            </thead>
            <tbody>
              {data.map((agent, i) => (
                <tr key={i} className="tr">
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="font-semibold text-slate-800">{agent.agent}</span>
                    </div>
                  </td>
                  {agent.monthly.map((m, j) => (
                    <td key={j} className="td text-center p-0">
                      {m.bonus > 0 ? (
                        <button
                          onClick={() => setDrill({ agent: agent.agent, month: m.month, monthName: monthNames[j] })}
                          className="w-full h-full px-2 py-2 text-xs font-semibold text-emerald-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors rounded whitespace-nowrap">
                          {fmt(m.bonus)}
                        </button>
                      ) : (
                        <span className="text-slate-200 text-xs">—</span>
                      )}
                    </td>
                  ))}
                  <td className="td text-right font-black text-indigo-600 whitespace-nowrap">{fmt(agent.total)}</td>
                </tr>
              ))}
              {data.length > 0 && (
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td className="td font-bold text-slate-700">Σύνολο</td>
                  {monthNames.map((_, i) => {
                    const month = String(i + 1).padStart(2, '0');
                    const total = data.reduce((s, a) => s + (a.monthly.find(m => m.month === month)?.bonus || 0), 0);
                    return (
                      <td key={i} className={`td text-center text-xs whitespace-nowrap ${total > 0 ? 'font-bold text-slate-700' : 'text-slate-200'}`}>
                        {total > 0 ? fmt(total) : '—'}
                      </td>
                    );
                  })}
                  <td className="td text-right font-black text-indigo-700">{fmt(grandTotal)}</td>
                </tr>
              )}
              {data.length === 0 && (
                <tr><td colSpan={14} className="td text-center text-slate-400 py-10">
                  <div className="text-3xl mb-2">📊</div>
                  Δεν υπάρχουν δεδομένα για το {year}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!drill} onClose={() => setDrill(null)}
        title={`Ανάλυση Bonus — ${drill?.agent} · ${drill?.monthName} ${year}`} size="xl">
        {drill && <DrilldownModal agent={drill.agent} month={drill.month} monthName={drill.monthName} year={year} onClose={() => setDrill(null)} />}
      </Modal>
    </div>
  );
}
