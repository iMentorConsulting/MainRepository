import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../api/client';

const fmt = n => n ? Number(n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—';
const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

export default function BonusReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get(`/reports/bonus?year=${year}`).then(r => setData(r.data));
  }, [year]);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  // Build chart data: one row per month, each agent is a bar
  const chartData = monthNames.map((name, i) => {
    const month = String(i + 1).padStart(2, '0');
    const row = { month: name };
    data.forEach(agent => {
      const m = agent.monthly.find(x => x.month === month);
      row[agent.agent] = m?.bonus || 0;
    });
    return row;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Bonus Πρακτόρων</h1>
        <select className="input w-32" value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Chart */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Μηνιαίο Bonus ανά Πράκτορα — {year}</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => v.toLocaleString('el-GR')} tick={{ fontSize: 12 }} />
            <Tooltip formatter={v => v.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })} />
            <Legend />
            {data.map((agent, i) => (
              <Bar key={agent.agent} dataKey={agent.agent} fill={COLORS[i % COLORS.length]} radius={[4,4,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="table-head table-cell">Πράκτορας</th>
                {monthNames.map(m => <th key={m} className="table-head table-cell text-center">{m}</th>)}
                <th className="table-head table-cell text-right">Σύνολο</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((agent, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="table-cell font-semibold">{agent.agent}</td>
                  {agent.monthly.map((m, j) => (
                    <td key={j} className={`table-cell text-center text-sm ${m.bonus > 0 ? 'text-green-700 font-medium' : 'text-gray-300'}`}>
                      {m.bonus > 0 ? fmt(m.bonus) : '—'}
                    </td>
                  ))}
                  <td className="table-cell text-right font-bold text-primary-700">{fmt(agent.total)}</td>
                </tr>
              ))}
              {data.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="table-cell">Σύνολο</td>
                  {monthNames.map((_, i) => {
                    const month = String(i + 1).padStart(2, '0');
                    const total = data.reduce((s, a) => s + (a.monthly.find(m => m.month === month)?.bonus || 0), 0);
                    return <td key={i} className="table-cell text-center text-sm">{total > 0 ? fmt(total) : '—'}</td>;
                  })}
                  <td className="table-cell text-right">{fmt(data.reduce((s, a) => s + a.total, 0))}</td>
                </tr>
              )}
              {data.length === 0 && <tr><td colSpan={14} className="table-cell text-center text-gray-400 py-8">Δεν υπάρχουν δεδομένα για το {year}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
