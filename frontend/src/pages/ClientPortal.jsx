import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPortalCase } from '../api'
import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
  CalendarDaysIcon,
  CurrencyEuroIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftEllipsisIcon,
  PhoneIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'

const PHASE_COLORS = {
  green: { active: 'bg-green-500', done: 'bg-green-400', pending: 'bg-gray-200', text: 'text-green-700' },
  blue: { active: 'bg-blue-500', done: 'bg-blue-400', pending: 'bg-gray-200', text: 'text-blue-700' },
  yellow: { active: 'bg-yellow-500', done: 'bg-yellow-400', pending: 'bg-gray-200', text: 'text-yellow-700' },
  purple: { active: 'bg-purple-500', done: 'bg-purple-400', pending: 'bg-gray-200', text: 'text-purple-700' },
  orange: { active: 'bg-orange-500', done: 'bg-orange-400', pending: 'bg-gray-200', text: 'text-orange-700' },
}

function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function KpiCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3 shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        <div className="text-lg font-bold text-gray-900 leading-tight">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function PipelineStepper({ phases, currentPhaseId }) {
  const currentIdx = phases.findIndex(p => p.id === currentPhaseId)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Πορεία Υπόθεσης</h3>
      <div className="flex items-start gap-0">
        {phases.map((phase, idx) => {
          const isDone = currentIdx > idx
          const isActive = currentIdx === idx
          const isPending = currentIdx < idx
          const colors = PHASE_COLORS[phase.color] || PHASE_COLORS.blue

          return (
            <div key={phase.id} className="flex-1 flex flex-col items-center relative">
              {idx < phases.length - 1 && (
                <div
                  className={`absolute top-4 left-1/2 w-full h-0.5 z-0 ${isDone ? colors.done : 'bg-gray-200'}`}
                  style={{ transform: 'translateY(-50%)' }}
                />
              )}
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold
                  ${isDone ? colors.done : isActive ? colors.active : 'bg-gray-200 text-gray-400'}`}
              >
                {isDone ? <CheckCircleIcon className="w-5 h-5" /> : idx + 1}
              </div>
              <div className={`text-center mt-2 text-xs leading-tight max-w-[80px]
                ${isActive ? `font-semibold ${colors.text}` : isDone ? 'text-gray-500' : 'text-gray-400'}`}>
                {phase.label}
              </div>
              {isActive && (
                <div className={`mt-1 text-xs px-1.5 py-0.5 rounded-full font-semibold ${colors.active} text-white`}>
                  Τώρα
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ClientPortal() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getPortalCase(token)
      .then(setData)
      .catch(err => {
        setError(err.response?.status === 404 ? 'not_found' : 'error')
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <BuildingOffice2Icon className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 mb-2">Η σελίδα δεν βρέθηκε</h2>
        <p className="text-gray-500 text-sm max-w-md">
          Ο σύνδεσμος που χρησιμοποιήσατε δεν είναι έγκυρος ή έχει απενεργοποιηθεί. Επικοινωνήστε με τον σύμβουλό σας.
        </p>
        <div className="mt-6 text-xs text-gray-400">iMentor Consulting © {new Date().getFullYear()}</div>
      </div>
    )
  }

  const subsidy = data.subsidy_percent ? `${data.subsidy_percent}%` : '—'
  const budget = data.approved_budget ? `${data.approved_budget.toLocaleString('el-GR')} €` : '—'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          <BuildingOffice2Icon className="w-9 h-9 text-blue-300 flex-shrink-0" />
          <div>
            <div className="font-bold text-lg leading-tight">iMentor Consulting</div>
            <div className="text-blue-300 text-xs">Πύλη Πελάτη</div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Welcome */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{data.client_name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{data.service_type}</p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border
              ${data.program_category === 'ΕΣΠΑ' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                data.program_category === 'ΔΥΠΑ' ? 'bg-green-50 text-green-700 border-green-200' :
                'bg-purple-50 text-purple-700 border-purple-200'}`}>
              {data.program_category}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1e3a5f] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              <ClockIcon className="w-4 h-4" />
              {data.status}
            </span>
          </div>
          {data.assigned_agent_name && (
            <p className="mt-2 text-xs text-gray-400">Υπεύθυνος: <span className="font-medium text-gray-600">{data.assigned_agent_name}</span></p>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard icon={CurrencyEuroIcon} label="Εγκεκριμένος Προϋπολογισμός" value={budget} color="blue" />
          <KpiCard icon={CurrencyEuroIcon} label="Ποσοστό Επιδότησης" value={subsidy} color="green" />
          <KpiCard icon={CalendarDaysIcon} label="Ημερ. Έγκρισης" value={fmtDate(data.approval_date)} color="purple" />
          <KpiCard icon={CalendarDaysIcon} label="Προθεσμία" value={fmtDate(data.project_deadline)} color="orange" />
        </div>

        {/* Pipeline */}
        {data.pipeline_phases?.length > 0 && (
          <PipelineStepper phases={data.pipeline_phases} currentPhaseId={data.current_phase_id} />
        )}

        {/* Pending Items */}
        {data.pending_items?.length > 0 && (
          <div className="bg-white rounded-xl border border-orange-200 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
              <ExclamationCircleIcon className="w-5 h-5" />
              Εκκρεμότητες ({data.pending_items.length})
            </h3>
            <div className="space-y-2">
              {data.pending_items.map((item, idx) => (
                <div key={item.id} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm text-gray-800">{item.item_text}</p>
                    {item.comment && (
                      <p className="text-xs text-gray-500 italic mt-0.5">→ {item.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {data.messages?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <ChatBubbleLeftEllipsisIcon className="w-5 h-5 text-gray-400" />
              Ενημερώσεις
            </h3>
            <div className="space-y-3">
              {data.messages.map(msg => (
                <div key={msg.id} className="flex gap-3 items-start">
                  <div className="w-7 h-7 bg-[#1e3a5f] rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
                    {(msg.author || 'i')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">{msg.author || 'iMentor'}</span>
                      <span className="text-xs text-gray-400">{fmtDate(msg.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-line">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact Footer */}
        <div className="bg-[#1e3a5f] text-white rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Επικοινωνία</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href="tel:+302101234567" className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors">
              <PhoneIcon className="w-4 h-4" /> +30 210 123 4567
            </a>
            <a href="mailto:info@i-mentor.gr" className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors">
              <EnvelopeIcon className="w-4 h-4" /> info@i-mentor.gr
            </a>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 text-xs text-blue-300 text-center">
            iMentor Consulting © {new Date().getFullYear()} · Σύστημα Πελάτη
          </div>
        </div>
      </div>
    </div>
  )
}
