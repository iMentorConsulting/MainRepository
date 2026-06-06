import { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  children: ReactNode
  className?: string
}

export function ChartCard({ title, children, className }: ChartCardProps) {
  return (
    <div className={`relative overflow-hidden p-6 rounded-2xl ${className || ''}`} style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(20px)',
    }}>
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)'}} />
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  )
}
