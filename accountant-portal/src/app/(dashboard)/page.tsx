'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { StatCard } from '@/components/dashboard/stat-card'
import { ChartCard } from '@/components/dashboard/chart-card'
import { Users, Building2, Target, Zap, Megaphone, MessageSquare } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

interface DashboardStats {
  totalAccountants?: number
  totalBusinesses: number
  activePrograms: number
  totalMatches: number
  campaignsSent: number
  pendingRequests: number
  businessesByCategory: Array<{ name: string; count: number }>
  businessesByRegion: Array<{ name: string; count: number }>
  matchesByProgram: Array<{ name: string; count: number }>
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
      </div>
    )
  }

  const isAdmin = session?.user?.role === 'ADMIN'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Καλωσήλθατε, {session?.user?.name?.split(' ')[0]}!
        </h1>
        <p className="text-gray-500 mt-1">
          {isAdmin ? 'Επισκόπηση συστήματος I-MENTOR Portal' : 'Επισκόπηση του λογιστικού σας γραφείου'}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isAdmin && (
          <StatCard
            title="Λογιστές"
            value={stats?.totalAccountants ?? 0}
            icon={Users}
            color="blue"
          />
        )}
        <StatCard
          title="Επιχειρήσεις"
          value={stats?.totalBusinesses ?? 0}
          icon={Building2}
          color="green"
        />
        <StatCard
          title="Ενεργά Προγράμματα"
          value={stats?.activePrograms ?? 0}
          icon={Target}
          color="orange"
        />
        <StatCard
          title="Matches"
          value={stats?.totalMatches ?? 0}
          icon={Zap}
          color="purple"
        />
        <StatCard
          title="Καμπάνιες Απεσταλμένες"
          value={stats?.campaignsSent ?? 0}
          icon={Megaphone}
          color="blue"
        />
        <StatCard
          title="Εκκρεμή Αιτήματα"
          value={stats?.pendingRequests ?? 0}
          icon={MessageSquare}
          color="red"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Επιχειρήσεις ανά Κατηγορία ΚΑΔ">
          {stats?.businessesByCategory && stats.businessesByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.businessesByCategory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#1e40af" radius={[4, 4, 0, 0]} name="Επιχειρήσεις" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
              Δεν υπάρχουν δεδομένα ακόμη
            </div>
          )}
        </ChartCard>

        <ChartCard title="Επιχειρήσεις ανά Περιοχή">
          {stats?.businessesByRegion && stats.businessesByRegion.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.businessesByRegion} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} name="Επιχειρήσεις" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
              Δεν υπάρχουν δεδομένα ακόμη
            </div>
          )}
        </ChartCard>
      </div>

      {stats?.matchesByProgram && stats.matchesByProgram.length > 0 && (
        <ChartCard title="Matches ανά Πρόγραμμα">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.matchesByProgram} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} name="Matches" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  )
}
