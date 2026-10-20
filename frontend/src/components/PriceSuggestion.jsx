import { useEffect, useState } from 'react'
import { checkPrice } from '../api'

// Default price for a stay (seasonal rates per night + active discounts, else the unit's base price)
export function useSuggestedPrice(unitId, checkIn, checkOut) {
  const [quote, setQuote] = useState(null)
  useEffect(() => {
    setQuote(null)
    if (!unitId || !checkIn || !checkOut || checkOut <= checkIn) return
    let cancelled = false
    const t = setTimeout(() => {
      checkPrice({ unit_id: unitId, check_in: checkIn, check_out: checkOut })
        .then(r => { if (!cancelled) setQuote(r.data) })
        .catch(() => {})
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [unitId, checkIn, checkOut])
  return quote
}

const eur = (v) => `€${Number(v || 0).toLocaleString('el-GR', { maximumFractionDigits: 2 })}`

export function PriceHint({ quote, currentPrice, onApply }) {
  if (!quote) return null
  const differs = Math.abs((Number(currentPrice) || 0) - quote.suggested_price) >= 0.01
  const basis = [
    `${quote.nights} ${quote.nights === 1 ? 'νύχτα' : 'νύχτες'} × ~${eur(quote.avg_per_night)}`,
    quote.rate_names?.length ? quote.rate_names.join(', ') : null,
    quote.uses_base_price ? 'βασική τιμή' : null,
    quote.total_savings > 0 ? `έκπτωση −${eur(quote.total_savings)}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <p className="text-[11px] text-gray-500 mt-1 leading-snug">
      Προτεινόμενη τιμή <strong className="text-gray-700">{eur(quote.suggested_price)}</strong>
      <span className="block">{basis}</span>
      {differs && (
        <button type="button" onClick={() => onApply(quote.suggested_price)} className="text-blue-600 hover:underline font-medium">
          Εφαρμογή
        </button>
      )}
    </p>
  )
}
