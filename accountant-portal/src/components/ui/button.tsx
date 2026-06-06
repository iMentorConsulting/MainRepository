import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'destructive' | 'danger' | 'secondary' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed'
    const variants: Record<string, string> = {
      default:     'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20',
      primary:     'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20',
      outline:     'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300',
      ghost:       'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      destructive: 'bg-red-600 text-white hover:bg-red-700',
      danger:      'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
      secondary:   'bg-slate-100 text-slate-700 hover:bg-slate-200',
      success:     'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    }
    const sizes: Record<string, string> = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-5 py-2.5 text-sm gap-2',
    }
    return (
      <button ref={ref} className={cn(base, variants[variant] || variants.default, sizes[size], className)} {...props} />
    )
  }
)
Button.displayName = 'Button'
