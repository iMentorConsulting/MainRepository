import { cn } from '@/lib/utils'
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'secondary'
const styles: Record<BadgeVariant, string> = {
  default:   'bg-slate-100 text-slate-600 border-slate-200',
  secondary: 'bg-slate-100 text-slate-600 border-slate-200',
  success:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning:   'bg-amber-50 text-amber-700 border-amber-200',
  danger:    'bg-red-50 text-red-700 border-red-200',
  info:      'bg-blue-50 text-blue-700 border-blue-200',
  purple:    'bg-violet-50 text-violet-700 border-violet-200',
}
export function Badge({ variant = 'default', className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border', styles[variant], className)} {...props}>
      {children}
    </span>
  )
}
