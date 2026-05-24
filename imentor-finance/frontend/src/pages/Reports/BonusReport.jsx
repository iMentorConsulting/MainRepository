import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../api/client';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—';
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

export default function BonusReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState([]);

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
          <h1 className="page-title">Bonus Πρακτόρων</h1>
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
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white"
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
          {data.length > 0 && (
            <div className="card p-4 border-2 border-indigo-100 bg-indigo-50/30">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Σύνολο</div>
              <div className="text-xl font-black text-indigo-700">{fmt(grandTotal)}</div>
            </div>
          )}
        </div>
      )}

      <div className="card p-6">
        <h2 className="section-title">Μηνιαίο Bonus ανά Πράκτορα — {year}</h2>
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Πράκτορας</th>
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
                    <td key={j} className={`td text-center text-xs whitespace-nowrap ${m.bonus > 0 ? 'font-semibold text-emerald-600' : 'text-slate-200'}`}>
                      {m.bonus > 0 ? fmt(m.bonus) : '—'}
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
    </div>
  );
}
