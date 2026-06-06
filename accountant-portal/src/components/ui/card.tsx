import { cn } from '@/lib/utils'

export function Card({ className, children, glow, ...props }: React.HTMLAttributes<HTMLDivElement> & { glow?: string }) {
  return (
    <div className={cn('relative overflow-hidden', className)}
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
      {...props}>
      {glow && (
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{background: `linear-gradient(90deg, transparent, ${glow}, transparent)`}} />
      )}
      {children}
    </div>
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pb-4', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold text-text-secondary uppercase tracking-wider', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-6 pt-0', className)}
      style={{borderTop: '1px solid rgba(255,255,255,0.06)'}}
      {...props} />
  )
}
