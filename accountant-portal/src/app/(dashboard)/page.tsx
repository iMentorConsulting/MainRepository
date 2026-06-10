'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { StatCard } from '@/components/dashboard/stat-card'
import { ChartCard } from '@/components/dashboard/chart-card'
import { Users, Building2, Target, Zap, Send, Inbox, Upload, Mail, ChevronRight, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

interface DashboardStats {
  totalAccountants?: number
  totalBusinesses: number
  individualsCount?: number
  companiesCount?: number
  activePrograms: number
  totalMatches: number
  campaignsSent: number
  pendingRequests: number
  businessesByLegalStatus: Array<{ name: string; count: number }>
  businessesByRegion: Array<{ name: string; count: number }>
  matchesByProgram: Array<{ name: string; count: number }>
}

const customTooltipStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  color: '#0f172a',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

function OnboardingGuide({ stats }: { stats: DashboardStats }) {
  const hasBusinesses = stats.totalBusinesses > 0
  const hasMatches = stats.totalMatches > 0
  const hasCampaigns = stats.campaignsSent > 0

  const steps = [
    {
      done: hasBusinesses,
      title: 'Βήμα 1 — Καταχωρήστε τους πελάτες σας',
      desc: hasBusinesses
        ? `Έχετε ${stats.totalBusinesses} επιχειρήσεις. Προσθέστε κι άλλες — τα προγράμματα έχουν σύντομες προθεσμίες!`
        : 'Εισάγετε τους πελάτες σας ώστε να ελεγχθεί ποιοι είναι επιλέξιμοι πριν λήξουν τα προγράμματα.',
      action: '/businesses',
      actionLabel: hasBusinesses ? 'Προσθήκη επιχειρήσεων →' : 'Ξεκινήστε εδώ →',
      icon: Building2,
    },
    {
      done: hasMatches,
      title: 'Βήμα 2 — Ελέγξτε ποιοι επιλέγονται',
      desc: hasMatches
        ? `${stats.totalMatches} πελάτες σας είναι επιλέξιμοι για ενεργά προγράμματα. Μην τους αφήσετε να χάσουν την ευκαιρία!`
        : 'Το σύστημα εντοπίζει αυτόματα ποιοι πελάτες σας πληρούν τα κριτήρια κάθε προγράμματος.',
      action: '/matches',
      actionLabel: hasMatches ? 'Δείτε ποιοι επιλέγονται →' : 'Προσθέστε πρώτα πελάτες',
      icon: Target,
    },
    {
      done: hasCampaigns,
      title: 'Βήμα 3 — Ενημερώστε τους πελάτες σας',
      desc: hasCampaigns
        ? `Έχετε στείλει ${stats.campaignsSent} καμπάνι${stats.campaignsSent === 1 ? 'α' : 'ες'}. Συνεχίστε — οι πελάτες σας πρέπει να γνωρίζουν τις ευκαιρίες τους εγκαίρως.`
        : 'Ενημερώστε τους πελάτες σας για τα προγράμματα που τους αφορούν, πριν λήξουν οι προθεσμίες υποβολής.',
      action: '/campaigns/new',
      actionLabel: hasCampaigns ? 'Νέα καμπάνια →' : hasMatches ? 'Στείλτε ενημέρωση τώρα →' : 'Αναμένετε matches',
      icon: Mail,
    },
  ]

  const allDone = hasBusinesses && hasMatches && hasCampaigns

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-indigo-900">
            {allDone ? '✅ Οι πελάτες σας είναι ενημερωμένοι!' : 'Ξεκινήστε σε 3 βήματα'}
          </h2>
          <p className="text-xs text-indigo-600 mt-0.5">
            {allDone
              ? 'Συνεχίστε να ελέγχετε νέα προγράμματα — οι προθεσμίες μπορεί να αλλάξουν οποιαδήποτε στιγμή.'
              : 'Τα ενεργά προγράμματα έχουν σύντομες προθεσμίες. Ενημερώστε τους πελάτες σας εγκαίρως.'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step, i) => (
          <div key={i} className={`bg-white rounded-xl p-4 border ${step.done ? 'border-green-200' : 'border-indigo-100'} relative overflow-hidden`}>
            {step.done && <div className="absolute top-3 right-3"><CheckCircle2 size={16} className="text-green-500" /></div>}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${step.done ? 'bg-green-100' : 'bg-indigo-100'}`}>
              <step.icon size={16} className={step.done ? 'text-green-600' : 'text-indigo-600'} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">{step.title}</h3>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">{step.desc}</p>
            <Link
              href={step.action}
              className={`text-xs font-medium flex items-center gap-1 ${step.done ? 'text-green-600 hover:text-green-700' : 'text-indigo-600 hover:text-indigo-700'}`}
            >
              {step.actionLabel} <ChevronRight size={12} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

function BusinessNudge({ stats }: { stats: DashboardStats }) {
  if (stats.totalBusinesses >= 50) return null

  return (
    <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
      <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center flex-shrink-0">
        <Upload size={18} className="text-white" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-bold text-amber-900">
          ⏰ Τα προγράμματα έχουν σύντομη λήξη — πελάτες που δεν είναι καταχωρημένοι θα τα χάσουν!
        </h3>
        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
          Μπορείτε να προσθέσετε πελάτες εύκολα — είτε έναν-έναν μέσω ΑΦΜ, είτε μαζικά από αρχείο Excel.
          Το σύστημα αναλαμβάνει τα υπόλοιπα και σας ενημερώνει για ποιους επιλέγονται.
        </p>
        <div className="flex flex-wrap gap-3 mt-3">
          <Link href="/businesses" className="text-xs font-semibold bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors">
            Προσθήκη Επιχειρήσεων →
          </Link>
          <Link href="/businesses" className="text-xs font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1">
            Αναζήτηση μέσω ΑΦΜ <ChevronRight size={12} />
          </Link>
        </div>
      </div>
      <div className="hidden md:flex flex-col items-center bg-white rounded-xl px-4 py-3 border border-amber-100 text-center">
        <span className="text-2xl font-bold text-amber-500">{stats.activePrograms}</span>
        <span className="text-xs text-amber-700 mt-0.5">ενεργά<br/>προγράμματα</span>
      </div>
    </div>
  )
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
          <div className="w-10 h-10 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
          <p className="text-slate-400 text-sm">Φόρτωση δεδομένων...</p>
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
          <p className="text-slate-500 mt-1 text-sm">
            {isAdmin ? 'Επισκόπηση συστήματος I-MENTOR Portal' : 'Επισκόπηση του λογιστικού σας γραφείου'}
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Overview</p>
          <p className="text-xs text-slate-400 mt-0.5">{new Date().toLocaleDateString('el-GR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* Accountant onboarding guide */}
      {!isAdmin && stats && <OnboardingGuide stats={stats} />}

      {/* Business nudge for accountants with few businesses */}
      {!isAdmin && stats && <BusinessNudge stats={stats} />}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isAdmin && (
          <StatCard
            title="Λογιστές"
            value={stats?.totalAccountants ?? 0}
            icon={Users}
            color="violet"
          />
        )}
        <StatCard
          title="Επιχειρήσεις"
          value={stats?.companiesCount ?? 0}
          subtitle={`+ ${stats?.individualsCount ?? 0} ιδιώτες (${stats?.totalBusinesses ?? 0} σύνολο)`}
          icon={Building2}
          color="emerald"
        />
        <StatCard
          title="Ενεργά Προγράμματα"
          value={stats?.activePrograms ?? 0}
          icon={Zap}
          color="amber"
        />
        <StatCard
          title="Matches"
          value={stats?.totalMatches ?? 0}
          icon={Target}
          color="indigo"
        />
        <StatCard
          title="Καμπάνιες Απεσταλμένες"
          value={stats?.campaignsSent ?? 0}
          icon={Send}
          color="rose"
        />
        <StatCard
          title="Εκκρεμή Αιτήματα"
          value={stats?.pendingRequests ?? 0}
          icon={Inbox}
          color="amber"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Επιχειρήσεις ανά Νομική Μορφή">
          {stats?.businessesByLegalStatus && stats.businessesByLegalStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.businessesByLegalStatus} margin={{ top: 5, right: 10, left: -20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-20} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={customTooltipStyle} cursor={{fill: 'rgba(99,102,241,0.05)'}} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Επιχειρήσεις" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400 text-sm">
              Δεν υπάρχουν δεδομένα ακόμη
            </div>
          )}
        </ChartCard>

        <ChartCard title="Επιχειρήσεις ανά Περιφέρεια">
          {stats?.businessesByRegion && stats.businessesByRegion.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.businessesByRegion} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={customTooltipStyle} cursor={{fill: 'rgba(5,150,105,0.05)'}} />
                <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} name="Επιχειρήσεις" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400 text-sm">
              Δεν υπάρχουν δεδομένα ακόμη
            </div>
          )}
        </ChartCard>
      </div>

      {stats?.matchesByProgram && stats.matchesByProgram.length > 0 && (
        <ChartCard title="Matches ανά Πρόγραμμα">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.matchesByProgram} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip contentStyle={customTooltipStyle} cursor={{fill: 'rgba(99,102,241,0.05)'}} />
              <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Matches" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  )
}
