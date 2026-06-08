import { GREEK_REGIONS } from '@/lib/greek-regions'

export function RegionMultiSelect({ label, values, onChange }: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
}) {
  function toggle(region: string) {
    if (values.includes(region)) onChange(values.filter(v => v !== region))
    else onChange([...values, region])
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
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
      <p className="text-xs text-slate-400">
        Η αντιστοίχιση επιχείρησης σε περιφέρεια γίνεται αυτόματα βάσει του Ταχυδρομικού Κώδικα (ΤΚ).
      </p>
    </div>
  )
}
