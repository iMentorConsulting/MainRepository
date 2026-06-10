'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Target, Calendar, Zap, TrendingUp, MapPin, Archive } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Program {
  id: string
  title: string
  category: string
  description: string | null
  heroImageUrl: string | null
  active: boolean
  archived: boolean
  startDate: string | null
  endDate: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  regionRules: string[]
  kadRules: string[]
  extraCriteriaIds: string[]
  _count: { matches: number }
}

const categoryLabel: Record<string, string> = {
  ESPA: 'ΕΣΠΑ',
  DYPA: 'ΔΥΠΑ',
  MICROCREDITS: 'Μικροπιστώσεις',
  EXTRAJUDICIAL: 'Εξωδικαστικός',
  RENOVATION: 'Ανακαίνιση',
  OTHER: 'Άλλο',
}

const categoryColor: Record<string, string> = {
  ESPA: 'from-blue-700 to-blue-900',
  DYPA: 'from-emerald-600 to-teal-800',
  MICROCREDITS: 'from-amber-600 to-orange-800',
  EXTRAJUDICIAL: 'from-rose-700 to-red-900',
  RENOVATION: 'from-violet-600 to-purple-900',
  OTHER: 'from-slate-600 to-slate-800',
}

const categoryVariant: Record<string, any> = {
  ESPA: 'default',
  DYPA: 'success',
  MICROCREDITS: 'warning',
  EXTRAJUDICIAL: 'danger',
  RENOVATION: 'info',
  OTHER: 'secondary',
}

function formatEuro(value: number) {
  return value.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

export default function ProgramsPage() {
  const { data: session } = useSession()
  const [programs, setPrograms] = useState<Program[]>([])
  const [filter, setFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [criteriaMap, setCriteriaMap] = useState<Record<string, string>>({})
  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(data => setPrograms(data.programs || []))
      .finally(() => setLoading(false))
    fetch('/api/admin/criteria')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map: Record<string, string> = {}
          for (const c of data) map[c.id] = c.label
          setCriteriaMap(map)
        }
      })
      .catch(() => {})
  }, [])

  const visible = programs.filter(p => showArchived ? p.archived : !p.archived)
  const filtered = filter ? visible.filter(p => p.category === filter) : visible
  const archivedCount = programs.filter(p => p.archived).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Προγράμματα</h1>
          <p className="text-gray-500 mt-1">{programs.filter(p => !p.archived).length} ενεργά{archivedCount > 0 ? ` · ${archivedCount} αρχειοθετημένα` : ''}</p>
        </div>
        {isAdmin && (
          <Link href="/programs/new">
            <Button><Plus size={16} className="mr-2" />Νέο Πρόγραμμα</Button>
          </Link>
        )}
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {['', 'ESPA', 'DYPA', 'MICROCREDITS', 'EXTRAJUDICIAL', 'RENOVATION'].map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === cat
                ? 'bg-blue-800 text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {cat ? categoryLabel[cat] : 'Όλα'}
          </button>
        ))}
        {isAdmin && archivedCount > 0 && (
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              showArchived
                ? 'bg-amber-600 text-white'
                : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-50'
            }`}
          >
            <Archive size={13} />
            {showArchived ? 'Αρχειοθετημένα' : `Αρχείο (${archivedCount})`}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(program => (
            <Link key={program.id} href={`/programs/${program.id}`} className="block group">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-200 cursor-pointer h-full flex flex-col group-hover:-translate-y-0.5">
                {/* Hero image / gradient banner */}
                <div className={`relative h-36 bg-gradient-to-br ${categoryColor[program.category] || 'from-slate-600 to-slate-800'} overflow-hidden flex-shrink-0`}>
                  {program.heroImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={program.heroImageUrl}
                      alt={program.title}
                      className="w-full h-full object-cover opacity-80"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                      <Target size={80} className="text-white" />
                    </div>
                  )}
                  {/* Category badge */}
                  <div className="absolute top-3 right-3">
                    <span className="bg-white/90 backdrop-blur-sm text-xs font-bold px-2.5 py-1 rounded-full text-gray-800">
                      {categoryLabel[program.category]}
                    </span>
                  </div>
                  {(!program.active || program.archived) && (
                    <div className="absolute top-3 left-3 flex gap-1">
                      {!program.active && <span className="bg-gray-800/80 text-white text-xs font-medium px-2 py-0.5 rounded-full">Ανενεργό</span>}
                      {program.archived && <span className="bg-amber-700/90 text-white text-xs font-medium px-2 py-0.5 rounded-full">Αρχείο</span>}
                    </div>
                  )}
                  {/* Matches badge */}
                  <div className="absolute bottom-3 left-3">
                    <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${program._count.matches > 0 ? 'bg-green-500 text-white' : 'bg-black/40 text-white'}`}>
                      <Zap size={10} />
                      {program._count.matches} matches
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-bold text-gray-900 mb-2 leading-snug text-sm">{program.title}</h3>
                  {program.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{program.description}</p>
                  )}

                  {/* Details grid */}
                  <div className="mt-auto space-y-1.5 pt-3 border-t border-gray-100">
                    {(program.minInvestment || program.maxInvestment) && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <TrendingUp size={11} className="text-green-600 flex-shrink-0" />
                        <span className="font-medium">Επένδυση:</span>
                        <span>
                          {program.minInvestment && program.maxInvestment
                            ? `${formatEuro(program.minInvestment)} – ${formatEuro(program.maxInvestment)}`
                            : program.minInvestment
                            ? `από ${formatEuro(program.minInvestment)}`
                            : `έως ${formatEuro(program.maxInvestment!)}`}
                        </span>
                      </div>
                    )}
                    {(program.minSubsidyPct != null || program.maxSubsidyPct != null) && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <TrendingUp size={11} className="text-blue-600 flex-shrink-0" />
                        <span className="font-medium">Επιχορήγηση:</span>
                        <span>
                          {program.minSubsidyPct != null && program.maxSubsidyPct != null
                            ? `${program.minSubsidyPct}% – ${program.maxSubsidyPct}%`
                            : program.minSubsidyPct != null
                            ? `από ${program.minSubsidyPct}%`
                            : `έως ${program.maxSubsidyPct}%`}
                        </span>
                      </div>
                    )}
                    {(program.minInterestRate != null || program.maxInterestRate != null) && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <TrendingUp size={11} className="text-amber-600 flex-shrink-0" />
                        <span className="font-medium">Επιτόκιο:</span>
                        <span>
                          {program.minInterestRate != null && program.maxInterestRate != null
                            ? `${program.minInterestRate}% – ${program.maxInterestRate}%`
                            : program.minInterestRate != null
                            ? `από ${program.minInterestRate}%`
                            : `έως ${program.maxInterestRate}%`}
                        </span>
                      </div>
                    )}
                    {program.regionRules.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <MapPin size={11} className="text-indigo-500 flex-shrink-0" />
                        <span className="truncate">{program.regionRules.slice(0, 2).join(', ')}{program.regionRules.length > 2 ? ` +${program.regionRules.length - 2}` : ''}</span>
                      </div>
                    )}
                    {program.endDate && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Calendar size={11} className="flex-shrink-0" />
                        <span>Λήξη {formatDate(program.endDate)}</span>
                      </div>
                    )}
                    {program.extraCriteriaIds?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {program.extraCriteriaIds.map(cid => (
                          <Badge key={cid} variant="secondary" className="text-[10px]">{criteriaMap[cid] || cid}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center text-gray-400 py-12">
              Δεν βρέθηκαν προγράμματα
            </div>
          )}
        </div>
      )}
    </div>
  )
}
