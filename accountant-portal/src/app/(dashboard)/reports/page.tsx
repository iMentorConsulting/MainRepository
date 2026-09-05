'use client'
import { useEffect, useState } from 'react'
import { ChartCard } from '@/components/dashboard/chart-card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const COLORS = ['#1e40af', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#db2777']

export default function ReportsPage() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αναφορές & Στατιστικά</h1>
        <p className="text-gray-500 mt-1">Γραφήματα και στατιστικά συστήματος</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Επιχειρήσεις ανά Νομική Μορφή">
          {stats?.businessesByLegalStatus?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.businessesByLegalStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={70} interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#1e40af" radius={[4, 4, 0, 0]} name="Επιχειρήσεις" />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData />}
        </ChartCard>

        <ChartCard title="Επιχειρήσεις ανά Περιφέρεια">
          {stats?.businessesByRegion?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.businessesByRegion}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, count }) => `${name} (${count})`}
                >
                  {stats.businessesByRegion.map((_: any, index: number) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <NoData />}
        </ChartCard>

        <ChartCard title="Matches ανά Πρόγραμμα">
          {stats?.matchesByProgram?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.matchesByProgram} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill="#d97706" radius={[0, 4, 4, 0]} name="Matches" />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData />}
        </ChartCard>

        <ChartCard title="Στατιστικά">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Συνολικές Επιχειρήσεις', value: stats?.totalBusinesses ?? 0 },
              { label: 'Ενεργά Προγράμματα', value: stats?.activePrograms ?? 0 },
              { label: 'Συνολικά Matches', value: stats?.totalMatches ?? 0 },
              { label: 'Εκκρεμή Αιτήματα', value: stats?.pendingRequests ?? 0 },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-blue-900">{s.value}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

function NoData() {
  return (
    <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
      Δεν υπάρχουν δεδομένα ακόμη
    </div>
  )
}
