import { cn } from '@/lib/utils'
import { SelectHTMLAttributes, forwardRef } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{label}</label>
        )}
        <select
          ref={ref}
          className={cn(
            'block w-full rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none transition-all duration-200',
            className
          )}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: '#f0f4ff',
          }}
          {...props}
        >
          {placeholder && <option value="" style={{background: '#0a0a12'}}>{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value} style={{background: '#0a0a12'}}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs" style={{color: '#ef4444'}}>{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'
