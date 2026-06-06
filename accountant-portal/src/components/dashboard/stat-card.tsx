import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  color?: string
  trend?: { value: number; label: string }
}

export function StatCard({ title, value, subtitle, icon: Icon, color = '#00d4ff', trend }: StatCardProps) {
  return (
    <div className="relative overflow-hidden p-6 rounded-2xl transition-all duration-300 cursor-default"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = `${color}30`
        ;(e.currentTarget as HTMLElement).style.boxShadow = `0 0 30px ${color}10`
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      {/* Top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{background: `linear-gradient(90deg, transparent, ${color}60, transparent)`}} />

      {/* Background glow */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-5 blur-2xl"
        style={{background: color, transform: 'translate(30%, -30%)'}} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{background: `${color}15`, border: `1px solid ${color}25`}}>
            <Icon className="w-5 h-5" style={{color, filter: `drop-shadow(0 0 6px ${color})`}} />
          </div>
          {trend && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: trend.value >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: trend.value >= 0 ? '#10b981' : '#ef4444',
                border: `1px solid ${trend.value >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
              {trend.value >= 0 ? '+' : ''}{trend.value}%
            </span>
          )}
        </div>
        <p className="text-2xl font-bold text-text-primary mb-0.5">{value}</p>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">{title}</p>
        {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}
