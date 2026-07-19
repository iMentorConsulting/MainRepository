/**
 * Email normalization utilities — correct common domain typos and format issues
 * Common mistake: Greek users typing .fr (France) instead of .gr (Greece)
 */

export function normalizeEmail(email) {
  if (!email) return email

  let normalized = email.toLowerCase().trim()

  // Common Greek domain typos: .fr → .gr
  const corrections = {
    '@yahoo.fr': '@yahoo.gr',
    '@gmail.fr': '@gmail.gr',
    '@hotmail.fr': '@hotmail.gr',
    '@outlook.fr': '@outlook.gr',
    '@ionline.fr': '@ionline.gr',
    '@in.fr': '@in.gr',
    '@mail.fr': '@mail.gr',
    '@live.fr': '@live.gr',
  }

  for (const [typo, correct] of Object.entries(corrections)) {
    if (normalized.includes(typo)) {
      normalized = normalized.replace(typo, correct)
    }
  }

  return normalized
}

/**
 * Check if email might have a common typo
 * Used to warn users during input
 */
export function hasEmailTypo(email) {
  if (!email) return false

  const lowerEmail = email.toLowerCase()

  // Common mistakes
  return (
    lowerEmail.includes('@yahoo.fr') ||
    lowerEmail.includes('@gmail.fr') ||
    lowerEmail.includes('@hotmail.fr') ||
    lowerEmail.includes('@outlook.fr') ||
    lowerEmail.includes('@ionline.fr') ||
    lowerEmail.includes('@in.fr') ||
    lowerEmail.includes('@mail.fr') ||
    lowerEmail.includes('@live.fr')
  )
}

/**
 * Get the corrected version of an email
 */
export function getCorrectedEmail(email) {
  if (!hasEmailTypo(email)) return email
  return normalizeEmail(email)
}
