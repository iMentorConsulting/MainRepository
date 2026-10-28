import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'violet' | 'blue'
  trend?: { value: number; label: string }
}

const colorMap = {
  indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600' },
  rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600' },
  blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600' },
}

export function StatCard({ title, value, subtitle, icon: Icon, color = 'indigo', trend }: StatCardProps) {
  const c = colorMap[color]
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 hover:shadow-card-hover transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        {trend && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            trend.value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 mb-0.5">{value}</p>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}
