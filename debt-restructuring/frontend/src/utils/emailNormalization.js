/**
 * Email normalization utilities — correct common domain typos and format issues
 * Common mistake: Greek users typing .fr (France) instead of .gr (Greece)
 */

export function normalizeEmail(email) {
  if (!email) return email

  let normalized = email.toLowerCase().trim()

  // Common email typos: domain mistakes, country code errors, etc.
  const corrections = {
    // Country code typos: .fr → .gr, .con → .com
    '@yahoo.fr': '@yahoo.gr',
    '@gmail.fr': '@gmail.gr',
    '@hotmail.fr': '@hotmail.gr',
    '@outlook.fr': '@outlook.gr',
    '@ionline.fr': '@ionline.gr',
    '@in.fr': '@in.gr',
    '@mail.fr': '@mail.fr',
    '@live.fr': '@live.gr',
    '@gmail.con': '@gmail.com',
    '@hotmail.con': '@hotmail.com',
    '@outlook.con': '@outlook.com',
    '@yahoo.con': '@yahoo.com',
    // Domain name typos: gmial/gmai → gmail, yaho → yahoo
    '@gmial.com': '@gmail.com',
    '@gmai.com': '@gmail.com',
    '@yaho.gr': '@yahoo.gr',
    '@yaho.com': '@yahoo.com',
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

  return (
    // Country code typos
    lowerEmail.includes('@yahoo.fr') ||
    lowerEmail.includes('@gmail.fr') ||
    lowerEmail.includes('@hotmail.fr') ||
    lowerEmail.includes('@outlook.fr') ||
    lowerEmail.includes('@ionline.fr') ||
    lowerEmail.includes('@in.fr') ||
    lowerEmail.includes('@mail.fr') ||
    lowerEmail.includes('@live.fr') ||
    // .con instead of .com
    lowerEmail.includes('@gmail.con') ||
    lowerEmail.includes('@hotmail.con') ||
    lowerEmail.includes('@outlook.con') ||
    lowerEmail.includes('@yahoo.con') ||
    // Domain name typos
    lowerEmail.includes('@gmial.com') ||
    lowerEmail.includes('@gmai.com') ||
    lowerEmail.includes('@yaho.gr') ||
    lowerEmail.includes('@yaho.com')
  )
}

/**
 * Get the corrected version of an email
 */
export function getCorrectedEmail(email) {
  if (!hasEmailTypo(email)) return email
  return normalizeEmail(email)
}
