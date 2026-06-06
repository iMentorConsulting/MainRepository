import { cn } from '@/lib/utils'
import { forwardRef, InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{label}</label>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full px-4 py-2.5 rounded-xl text-sm text-text-primary placeholder-text-muted',
            'focus:outline-none transition-all duration-200',
            className
          )}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
          }}
          onFocus={e => {
            e.target.style.borderColor = error ? 'rgba(239,68,68,0.6)' : 'rgba(0,212,255,0.4)'
            e.target.style.boxShadow = error ? '0 0 0 3px rgba(239,68,68,0.08)' : '0 0 0 3px rgba(0,212,255,0.08)'
            e.target.style.background = 'rgba(255,255,255,0.06)'
          }}
          onBlur={e => {
            e.target.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'
            e.target.style.boxShadow = 'none'
            e.target.style.background = 'rgba(255,255,255,0.04)'
          }}
          {...props}
        />
        {error && <p className="text-xs" style={{color: '#ef4444'}}>{error}</p>}
        {helperText && !error && <p className="text-xs text-text-muted">{helperText}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
