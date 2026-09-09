import { Badge } from '@/components/ui/badge'

interface Activity {
  id?: string
  firmActCode: string
  firmActDescr: string | null
  firmActKind: number | null
  firmActKindDescr: string | null
}

export function KadTable({ activities }: { activities: Activity[] }) {
  if (!activities || activities.length === 0) {
    return <p className="text-sm text-gray-400 italic">Δεν βρέθηκαν ΚΑΔ</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ΚΑΔ</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Περιγραφή</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Τύπος</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {activities.map((act, i) => (
            <tr key={act.id || i} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono font-medium text-blue-800">{act.firmActCode}</td>
              <td className="px-4 py-3 text-gray-800 max-w-xs truncate">{act.firmActDescr || '-'}</td>
              <td className="px-4 py-3">
                <Badge variant={act.firmActKind === 1 ? 'default' : 'secondary'}>
                  {act.firmActKindDescr || (act.firmActKind === 1 ? 'Κύρια' : 'Δευτερεύουσα')}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
