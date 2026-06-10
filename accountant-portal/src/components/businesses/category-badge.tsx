import { Palmtree, ShoppingCart, Factory, UtensilsCrossed, Briefcase, Wheat, Tag } from 'lucide-react'
import { BusinessCategory, CATEGORY_COLORS } from '@/lib/business-categories'

const ICONS: Record<BusinessCategory, typeof Tag> = {
  'ΤΟΥΡΙΣΜΟΣ': Palmtree,
  'ΕΜΠΟΡΙΟ': ShoppingCart,
  'ΜΕΤΑΠΟΙΗΣΗ': Factory,
  'ΕΣΤΙΑΣΗ': UtensilsCrossed,
  'ΥΠΗΡΕΣΙΕΣ': Briefcase,
  'ΑΓΡΟΤΙΚΑ': Wheat,
  'ΑΛΛΟ': Tag,
}

export function CategoryBadge({ category, size = 'sm' }: { category: BusinessCategory; size?: 'sm' | 'lg' }) {
  const Icon = ICONS[category] || Tag
  const color = CATEGORY_COLORS[category] || '#6b7280'
  const isLg = size === 'lg'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${isLg ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'}`}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <Icon size={isLg ? 16 : 12} />
      {category}
    </span>
  )
}
