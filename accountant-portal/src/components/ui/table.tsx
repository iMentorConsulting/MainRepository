import { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">{children}</table>
      </div>
    </div>
  )
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('', className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('', className)} {...props} />
}

export function Th({ children, className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50', className)} {...props}>
      {children}
    </th>
  )
}

export function Td({ children, className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3.5 text-sm text-slate-700 border-b border-slate-50', className)} {...props}>
      {children}
    </td>
  )
}

export function Tr({ children, className, onClick, ...props }: HTMLAttributes<HTMLTableRowElement> & { onClick?: () => void }) {
  return (
    <tr
      className={cn('transition-colors duration-100', onClick ? 'cursor-pointer hover:bg-indigo-50/30' : 'hover:bg-slate-50/50', className)}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  )
}

export const TableRow = Tr
