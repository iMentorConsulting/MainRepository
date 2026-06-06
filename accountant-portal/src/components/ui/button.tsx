import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'secondary' | 'success' | 'default' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed rounded-xl'

    const variants: Record<string, string> = {
      primary: 'text-white',
      default: 'text-white',
      outline: 'border text-text-primary hover:text-white transition-all duration-200',
      ghost: 'text-text-secondary hover:text-text-primary hover:bg-white/5',
      danger: 'text-white',
      destructive: 'text-white',
      secondary: 'text-text-primary hover:text-white transition-all duration-200',
      success: 'text-white',
    }

    const sizes: Record<string, string> = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-6 py-3 text-sm gap-2',
    }

    const glowStyles: Record<string, React.CSSProperties> = {
      primary: { background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)', boxShadow: '0 0 20px rgba(0,212,255,0.3)' },
      default: { background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)', boxShadow: '0 0 20px rgba(0,212,255,0.3)' },
      success: { background: 'linear-gradient(135deg, #10b981, #00d4ff)', boxShadow: '0 0 20px rgba(16,185,129,0.3)' },
      danger: { background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)' },
      destructive: { background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)' },
      outline: { border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' },
      secondary: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' },
      ghost: {},
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant] || variants.primary, sizes[size], className)}
        style={glowStyles[variant] || glowStyles.primary}
        {...props}
      >
        {loading && (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
