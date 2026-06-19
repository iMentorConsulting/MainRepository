import { Badge } from '@/components/ui/badge'
import { CheckCircle, Clock, XCircle, ThumbsUp, Send } from 'lucide-react'

type MatchStatus = 'POTENTIAL' | 'REVIEWED' | 'REJECTED' | 'INTERESTED' | 'SUBMITTED'

interface MatchCardProps {
  businessName: string
  afm: string
  programTitle: string
  matchScore: number
  matchReason: string[]
  status: MatchStatus
  accountantName?: string | null
  otherRequirements?: string | null
  onStatusChange?: (status: MatchStatus) => void
}

const statusConfig: Record<MatchStatus, { label: string; variant: any; icon: any }> = {
  POTENTIAL: { label: 'Πιθανό', variant: 'default', icon: Clock },
  REVIEWED: { label: 'Ελέγχθηκε', variant: 'info', icon: CheckCircle },
  REJECTED: { label: 'Απορρίφθηκε', variant: 'danger', icon: XCircle },
  INTERESTED: { label: 'Ενδιαφέρον', variant: 'success', icon: ThumbsUp },
  SUBMITTED: { label: 'Υποβλήθηκε', variant: 'warning', icon: Send },
}

export function MatchCard({ businessName, afm, programTitle, matchScore, matchReason, status, accountantName, otherRequirements }: MatchCardProps) {
  const conf = statusConfig[status]
  const Icon = conf.icon
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-semibold text-gray-900">{businessName || '-'}</div>
          <div className="text-xs text-gray-500">ΑΦΜ: {afm}</div>
          <div className="text-xs text-blue-700 mt-0.5">{programTitle}</div>
          <div className="text-xs text-gray-500 mt-0.5">{accountantName || 'I-MENTOR'}</div>
        </div>
        <Badge variant={conf.variant} className="flex items-center gap-1">
          <Icon size={11} />
          {conf.label}
        </Badge>
      </div>
      {matchReason.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Λόγοι</div>
          <ul className="space-y-0.5">
            {matchReason.map((r, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-blue-500 flex-shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {otherRequirements && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-0.5">Πρόσθετες Προϋποθέσεις</div>
          <p className="text-xs text-gray-700 leading-relaxed">{otherRequirements}</p>
        </div>
      )}
    </div>
  )
}
