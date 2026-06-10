import { prisma } from './prisma'
import { CAMPAIGN_TEMPLATES, VIBER_CAMPAIGN_TEMPLATES } from './campaign-templates'

const CATEGORY_BY_KEY: Record<string, string> = {
  'program-eligibility': 'Επιλεξιμότητα Προγράμματος',
  'kad-match': 'Επιλεξιμότητα Προγράμματος',
  'ksekino-epixeirimatika': 'Επιλεξιμότητα Προγράμματος',
  'partnership-intro': 'Πρώτη Επαφή',
  'deadline-reminder': 'Υπενθυμίσεις',
  'viber-program-eligibility': 'Επιλεξιμότητα Προγράμματος',
  'viber-kad-match': 'Επιλεξιμότητα Προγράμματος',
  'viber-ksekino-epixeirimatika': 'Επιλεξιμότητα Προγράμματος',
  'viber-partnership-intro': 'Πρώτη Επαφή',
  'viber-deadline-reminder': 'Υπενθυμίσεις',
}

// Ensures the DB has an editable copy of every static template. Safe to call
// repeatedly — only inserts templates that don't exist yet.
export async function ensureTemplatesSeeded() {
  const existing = await prisma.messageTemplate.findMany({ select: { channel: true, templateKey: true } })
  const existingKeys = new Set(existing.map(e => `${e.channel}:${e.templateKey}`))

  const toCreate: any[] = []
  CAMPAIGN_TEMPLATES.forEach((t, i) => {
    if (!existingKeys.has(`EMAIL:${t.id}`)) {
      toCreate.push({
        channel: 'EMAIL',
        templateKey: t.id,
        category: CATEGORY_BY_KEY[t.id] || 'Άλλο',
        label: t.label,
        description: t.description,
        subject: t.subject,
        bodyWithAccountant: t.bodyWithAccountant,
        bodyDirect: t.bodyDirect,
        order: i,
      })
    }
  })
  VIBER_CAMPAIGN_TEMPLATES.forEach((t, i) => {
    if (!existingKeys.has(`VIBER:${t.id}`)) {
      toCreate.push({
        channel: 'VIBER',
        templateKey: t.id,
        category: CATEGORY_BY_KEY[t.id] || 'Άλλο',
        label: t.label,
        description: t.description,
        subject: t.subject,
        bodyWithAccountant: t.bodyWithAccountant,
        bodyDirect: t.bodyDirect,
        order: i,
      })
    }
  })

  if (toCreate.length > 0) {
    await prisma.messageTemplate.createMany({ data: toCreate })
  }
}
