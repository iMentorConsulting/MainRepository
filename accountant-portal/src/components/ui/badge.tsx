import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'secondary'

const styles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'rgba(255,255,255,0.08)', color: '#8892a4', border: '1px solid rgba(255,255,255,0.1)' },
  secondary: { background: 'rgba(255,255,255,0.08)', color: '#8892a4', border: '1px solid rgba(255,255,255,0.1)' },
  success: { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', boxShadow: '0 0 10px rgba(16,185,129,0.1)' },
  warning: { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 0 10px rgba(245,158,11,0.1)' },
  danger: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 0 10px rgba(239,68,68,0.1)' },
  info: { background: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.25)', boxShadow: '0 0 10px rgba(0,212,255,0.1)' },
  purple: { background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 0 10px rgba(139,92,246,0.1)' },
}

export function Badge({ variant = 'default', className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium', className)}
      style={styles[variant]}
      {...props}
    >
      {children}
    </span>
  )
}
