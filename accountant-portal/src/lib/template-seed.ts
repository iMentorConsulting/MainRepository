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

// Inserts the {{ermis_link}} line into a template body that has an
// {{unsubscribe_link}} but predates the Ερμής link addition. Idempotent.
function withErmisLink(body: string): string {
  if (body.includes('{{ermis_link}}') || !body.includes('{{unsubscribe_link}}')) return body
  const ermisLine = body.includes('*{{business_name}}*')
    ? '💬 Μίλα με τον Ερμή: {{ermis_link}}'
    : 'Μάθετε αμέσως αν είστε επιλέξιμοι μιλώντας με τον ψηφιακό μας σύμβουλο, τον Ερμή: {{ermis_link}}'
  const separator = body.includes('*{{business_name}}*') ? '\n' : '\n\n'
  return body.replace('{{unsubscribe_link}}', `${ermisLine}${separator}{{unsubscribe_link}}`)
}

// Viber templates were redesigned (bold section headers, ─── separators, no
// 👋 wave, no unsubscribe link). Old rows seeded before the redesign still
// carry the previous layout — detect and overwrite them in place so saved
// DB copies match the new hardcoded versions. Idempotent: a row already on
// the new design has neither marker below, so it's left untouched.
function needsViberRedesign(body: string): boolean {
  return body.includes('👋') || body.includes('{{unsubscribe_link}}')
}

// Ensures the DB has an editable copy of every static template. Safe to call
// repeatedly — inserts templates that don't exist yet, retrofits the
// {{ermis_link}} placeholder into older rows that predate it, and resyncs
// Viber rows still on the pre-redesign layout.
export async function ensureTemplatesSeeded() {
  const existing = await prisma.messageTemplate.findMany({ select: { id: true, channel: true, templateKey: true, bodyWithAccountant: true, bodyDirect: true } })
  const existingKeys = new Set(existing.map(e => `${e.channel}:${e.templateKey}`))

  for (const t of VIBER_CAMPAIGN_TEMPLATES) {
    const row = existing.find(e => e.channel === 'VIBER' && e.templateKey === t.id)
    if (row && (needsViberRedesign(row.bodyWithAccountant) || needsViberRedesign(row.bodyDirect))) {
      await prisma.messageTemplate.update({
        where: { id: row.id },
        data: { subject: t.subject, description: t.description, bodyWithAccountant: t.bodyWithAccountant, bodyDirect: t.bodyDirect },
      })
    }
  }

  for (const row of existing) {
    const newWithAccountant = withErmisLink(row.bodyWithAccountant)
    const newDirect = withErmisLink(row.bodyDirect)
    if (newWithAccountant !== row.bodyWithAccountant || newDirect !== row.bodyDirect) {
      await prisma.messageTemplate.update({
        where: { id: row.id },
        data: { bodyWithAccountant: newWithAccountant, bodyDirect: newDirect },
      })
    }
  }

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
