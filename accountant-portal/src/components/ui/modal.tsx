'use client'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0" style={{background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)'}} onClick={onClose} />
      <div className={cn(
        'relative w-full mx-4 max-h-[90vh] overflow-y-auto',
        {
          'max-w-sm': size === 'sm',
          'max-w-lg': size === 'md',
          'max-w-2xl': size === 'lg',
          'max-w-4xl': size === 'xl',
        }
      )}
        style={{
          background: 'rgba(10,10,18,0.95)',
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: '20px',
          boxShadow: '0 0 0 1px rgba(0,212,255,0.05), 0 32px 64px rgba(0,0,0,0.8)',
          backdropFilter: 'blur(20px)',
        }}>
        {/* Top glow line */}
        <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
          style={{background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.5), transparent)'}} />

        {title && (
          <div className="flex items-center justify-between px-6 py-4"
            style={{borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-lg hover:bg-white/5"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
