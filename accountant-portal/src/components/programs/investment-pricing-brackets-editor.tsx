'use client'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type PricingBracket } from '@/lib/investment-pricing'

export function InvestmentPricingBracketsEditor({ value, onChange }: { value: PricingBracket[]; onChange: (v: PricingBracket[]) => void }) {
  function update(i: number, patch: Partial<PricingBracket>) {
    onChange(value.map((b, idx) => idx === i ? { ...b, ...patch } : b))
  }
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Από (€)</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Έως (€, κενό = χωρίς όριο)</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Κόστος Αίτησης (€)</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Αμοιβή Παρακολούθησης (€)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {value.map((b, i) => (
                <tr key={i} className="border-t border-gray-200">
                  <td className="p-1"><input type="number" className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={b.minAmount} onChange={e => update(i, { minAmount: Number(e.target.value) })} /></td>
                  <td className="p-1"><input type="number" className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={b.maxAmount ?? ''} placeholder="χωρίς όριο" onChange={e => update(i, { maxAmount: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                  <td className="p-1"><input type="number" className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={b.applicationFee} onChange={e => update(i, { applicationFee: Number(e.target.value) })} /></td>
                  <td className="p-1"><input type="number" className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={b.implementationFee} onChange={e => update(i, { implementationFee: Number(e.target.value) })} /></td>
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const last = value[value.length - 1]
          const nextMin = last?.maxAmount != null ? last.maxAmount + 1 : (last?.minAmount ?? 0) + 1
          onChange([...value, { minAmount: nextMin, maxAmount: null, applicationFee: 0, implementationFee: 0 }])
        }}
      >
        <Plus size={14} className="mr-1.5" /> Προσθήκη Κλιμακίου
      </Button>
    </div>
  )
}
