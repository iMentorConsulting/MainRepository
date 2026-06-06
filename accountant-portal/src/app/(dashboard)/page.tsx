'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { StatCard } from '@/components/dashboard/stat-card'
import { ChartCard } from '@/components/dashboard/chart-card'
import { Users, Building2, Target, Zap, Send, Inbox } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
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

const customTooltipStyle = {
  background: 'rgba(10,10,18,0.95)',
  border: '1px solid rgba(0,212,255,0.2)',
  borderRadius: '12px',
  color: '#f0f4ff',
  fontSize: '12px',
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

  const isAdmin = session?.user?.role === 'ADMIN'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
            style={{borderTopColor: '#00d4ff', borderRightColor: '#8b5cf6'}} />
          <p className="text-text-muted text-sm">Φόρτωση δεδομένων...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">
            Καλωσήλθατε, {session?.user?.name?.split(' ')[0]}
          </h1>
          <p className="text-text-secondary mt-1 text-sm">
            {isAdmin ? 'Επισκόπηση συστήματος I-MENTOR Portal' : 'Επισκόπηση του λογιστικού σας γραφείου'}
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs text-text-muted font-mono uppercase tracking-wider">Command Center</p>
          <p className="text-xs text-text-muted mt-0.5">{new Date().toLocaleDateString('el-GR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isAdmin && (
          <StatCard
            title="Λογιστές"
            value={stats?.totalAccountants ?? 0}
            icon={Users}
            color="#8b5cf6"
          />
        )}
        <StatCard
          title="Επιχειρήσεις"
          value={stats?.totalBusinesses ?? 0}
          icon={Building2}
          color="#10b981"
        />
        <StatCard
          title="Ενεργά Προγράμματα"
          value={stats?.activePrograms ?? 0}
          icon={Zap}
          color="#f59e0b"
        />
        <StatCard
          title="Matches"
          value={stats?.totalMatches ?? 0}
          icon={Target}
          color="#00d4ff"
        />
        <StatCard
          title="Καμπάνιες Απεσταλμένες"
          value={stats?.campaignsSent ?? 0}
          icon={Send}
          color="#ec4899"
        />
        <StatCard
          title="Εκκρεμή Αιτήματα"
          value={stats?.pendingRequests ?? 0}
          icon={Inbox}
          color="#f59e0b"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Επιχειρήσεις ανά Κατηγορία ΚΑΔ">
          {stats?.businessesByCategory && stats.businessesByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.businessesByCategory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8892a4' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8892a4' }} />
                <Tooltip contentStyle={customTooltipStyle} cursor={{fill: 'rgba(0,212,255,0.05)'}} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Επιχειρήσεις" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-text-muted text-sm">
              Δεν υπάρχουν δεδομένα ακόμη
            </div>
          )}
        </ChartCard>

        <ChartCard title="Επιχειρήσεις ανά Περιοχή">
          {stats?.businessesByRegion && stats.businessesByRegion.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.businessesByRegion} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8892a4' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8892a4' }} />
                <Tooltip contentStyle={customTooltipStyle} cursor={{fill: 'rgba(0,212,255,0.05)'}} />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Επιχειρήσεις" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-text-muted text-sm">
              Δεν υπάρχουν δεδομένα ακόμη
            </div>
          )}
        </ChartCard>
      </div>

      {stats?.matchesByProgram && stats.matchesByProgram.length > 0 && (
        <ChartCard title="Matches ανά Πρόγραμμα">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.matchesByProgram} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8892a4' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8892a4' }} />
              <Tooltip contentStyle={customTooltipStyle} cursor={{fill: 'rgba(0,212,255,0.05)'}} />
              <Bar dataKey="count" fill="#00d4ff" radius={[4, 4, 0, 0]} name="Matches" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  )
}
