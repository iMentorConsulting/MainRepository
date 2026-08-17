'use client'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ExpenseCategory {
  code: string
  category: string
  expense: string
  limit: string
}

export function ExpenseCategoriesEditor({ value, onChange }: { value: ExpenseCategory[]; onChange: (v: ExpenseCategory[]) => void }) {
  function update(i: number, patch: Partial<ExpenseCategory>) {
    onChange(value.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  }
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600">Επιλέξιμες Κατηγορίες Δαπανών</label>
      {value.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Κωδικός</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Κατηγορία</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Δαπάνη</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Όριο</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {value.map((c, i) => (
                <tr key={i} className="border-t border-gray-200">
                  <td className="p-1"><input className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={c.code} onChange={e => update(i, { code: e.target.value })} /></td>
                  <td className="p-1"><input className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={c.category} onChange={e => update(i, { category: e.target.value })} /></td>
                  <td className="p-1"><input className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={c.expense} onChange={e => update(i, { expense: e.target.value })} /></td>
                  <td className="p-1"><input className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={c.limit} onChange={e => update(i, { limit: e.target.value })} /></td>
                  <td className="p-1">
                    <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { code: '', category: '', expense: '', limit: '' }])}>
        <Plus size={14} className="mr-1.5" /> Προσθήκη Γραμμής
      </Button>
    </div>
  )
}
