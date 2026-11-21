// The I-MENTOR logo in every outgoing email links to the company website.
export const IMENTOR_WEBSITE_URL = process.env.IMENTOR_WEBSITE_URL || 'https://i-mentor.gr/'

export function linkLogo(inner: string): string {
  return `<a href="${IMENTOR_WEBSITE_URL}" target="_blank" rel="noopener" style="display:block;text-decoration:none;color:inherit;">${inner}</a>`
}
