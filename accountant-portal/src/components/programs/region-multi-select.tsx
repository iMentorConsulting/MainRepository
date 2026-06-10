import { GREEK_REGIONS, zipPrefixesForRegion } from '@/lib/greek-regions'

export function RegionMultiSelect({ label, values, onChange }: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
}) {
  function toggle(region: string) {
    if (values.includes(region)) onChange(values.filter(v => v !== region))
    else onChange([...values, region])
  }

  const allSelected = values.length === GREEK_REGIONS.length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : [...GREEK_REGIONS])}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50 transition-colors"
        >
          {allSelected ? 'Καμία επιλογή' : 'Όλη η Ελλάδα'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl border border-slate-200 bg-white">
        {GREEK_REGIONS.map(region => (
          <label key={region} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={values.includes(region)}
              onChange={() => toggle(region)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-slate-700">{region}</span>
          </label>
        ))}
      </div>
      {values.length > 0 && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-1.5">
          <p className="text-xs font-medium text-indigo-900">Καλύπτονται οι ΤΚ που ξεκινούν με:</p>
          {values.map(region => (
            <div key={region} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-medium text-slate-600">{region}:</span>
              <span className="font-mono text-indigo-700">
                {zipPrefixesForRegion(region as any).map(p => `${p}x`).join(', ') || '—'}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400">
        Η αντιστοίχιση επιχείρησης σε περιφέρεια γίνεται αυτόματα βάσει του Ταχυδρομικού Κώδικα (ΤΚ).
      </p>
    </div>
  )
}
