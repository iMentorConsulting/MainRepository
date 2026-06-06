'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Plus, Target, Calendar, Zap } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Program {
  id: string
  title: string
  category: string
  description: string | null
  active: boolean
  startDate: string | null
  endDate: string | null
  _count: { matches: number }
}

const categoryLabel: Record<string, string> = {
  ESPA: 'ΕΣΠΑ',
  DYPA: 'ΔΥΠΑ',
  MICROLOANS: 'Μικροδάνεια',
  LOAN: 'Δάνεια',
  OTHER: 'Άλλο',
}

const categoryVariant: Record<string, any> = {
  ESPA: 'default',
  DYPA: 'success',
  MICROLOANS: 'warning',
  LOAN: 'info',
  OTHER: 'secondary',
}

export default function ProgramsPage() {
  const { data: session } = useSession()
  const [programs, setPrograms] = useState<Program[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(data => setPrograms(data.programs || []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter ? programs.filter(p => p.category === filter) : programs

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Προγράμματα</h1>
          <p className="text-gray-500 mt-1">{programs.length} προγράμματα συνολικά</p>
        </div>
        {isAdmin && (
          <Link href="/programs/new">
            <Button><Plus size={16} className="mr-2" />Νέο Πρόγραμμα</Button>
          </Link>
        )}
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 flex-wrap">
        {['', 'ESPA', 'DYPA', 'MICROLOANS', 'LOAN', 'OTHER'].map(cat => (
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
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(program => (
            <Link key={program.id} href={`/programs/${program.id}`}>
              <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Target size={20} className="text-blue-700" />
                  </div>
                  <div className="flex gap-1.5">
                    <Badge variant={categoryVariant[program.category]}>{categoryLabel[program.category]}</Badge>
                    {!program.active && <Badge variant="secondary">Ανενεργό</Badge>}
                  </div>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 leading-snug">{program.title}</h3>
                {program.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">{program.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1">
                    <Zap size={12} />
                    <span>{program._count.matches} matches</span>
                  </div>
                  {program.endDate && (
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      <span>Έως {formatDate(program.endDate)}</span>
                    </div>
                  )}
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
