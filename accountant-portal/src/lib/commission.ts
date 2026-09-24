import { CommissionType } from '@prisma/client'

interface CommissionPolicy {
  commissionType: CommissionType
  fixedAmount: number | null
  percentage: number | null
  minAmount: number | null
  maxAmount: number | null
}

interface Override {
  percentage?: number | null
  fixedAmount?: number | null
  minAmount?: number | null
  maxAmount?: number | null
}

export function calculateCommission(
  grossAmount: number, // in cents
  policy: CommissionPolicy,
  override?: Override | null
): { commissionAmount: number; commissionRate: number | null; breakdown: string } {
  // Merge override values
  const percentage = override?.percentage ?? policy.percentage
  const fixedAmount = override?.fixedAmount ?? policy.fixedAmount
  const minAmount = override?.minAmount ?? policy.minAmount
  const maxAmount = override?.maxAmount ?? policy.maxAmount

  let commissionAmount: number
  let commissionRate: number | null = null
  let breakdown: string

  switch (policy.commissionType) {
    case 'FIXED':
      commissionAmount = fixedAmount ?? 0
      breakdown = `Σταθερή προμήθεια: €${(commissionAmount / 100).toFixed(2)}`
      break

    case 'PERCENTAGE':
      commissionRate = percentage ?? 0
      commissionAmount = Math.round((grossAmount * commissionRate) / 100)
      breakdown = `${commissionRate}% επί €${(grossAmount / 100).toFixed(2)} = €${(commissionAmount / 100).toFixed(2)}`
      break

    case 'PERCENTAGE_WITH_MIN':
      commissionRate = percentage ?? 0
      commissionAmount = Math.round((grossAmount * commissionRate) / 100)
      if (minAmount && commissionAmount < minAmount) {
        commissionAmount = minAmount
        breakdown = `${commissionRate}% = €${((grossAmount * commissionRate) / 10000).toFixed(2)} → ελάχιστο €${(minAmount / 100).toFixed(2)}`
      } else {
        breakdown = `${commissionRate}% επί €${(grossAmount / 100).toFixed(2)} = €${(commissionAmount / 100).toFixed(2)}`
      }
      break

    case 'PERCENTAGE_WITH_MAX':
      commissionRate = percentage ?? 0
      commissionAmount = Math.round((grossAmount * commissionRate) / 100)
      if (maxAmount && commissionAmount > maxAmount) {
        commissionAmount = maxAmount
        breakdown = `${commissionRate}% = €${((grossAmount * commissionRate) / 10000).toFixed(2)} → μέγιστο €${(maxAmount / 100).toFixed(2)}`
      } else {
        breakdown = `${commissionRate}% επί €${(grossAmount / 100).toFixed(2)} = €${(commissionAmount / 100).toFixed(2)}`
      }
      break

    case 'PERCENTAGE_WITH_MIN_MAX': {
      commissionRate = percentage ?? 0
      commissionAmount = Math.round((grossAmount * commissionRate) / 100)
      const raw = commissionAmount
      if (minAmount && commissionAmount < minAmount) commissionAmount = minAmount
      if (maxAmount && commissionAmount > maxAmount) commissionAmount = maxAmount
      breakdown =
        `${commissionRate}% = €${(raw / 100).toFixed(2)}` +
        (minAmount ? ` (min €${(minAmount / 100).toFixed(2)})` : '') +
        (maxAmount ? ` (max €${(maxAmount / 100).toFixed(2)})` : '') +
        ` → €${(commissionAmount / 100).toFixed(2)}`
      break
    }

    default:
      commissionAmount = 0
      breakdown = 'Χωρίς προμήθεια'
  }

  return { commissionAmount, commissionRate, breakdown }
}

export function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}
