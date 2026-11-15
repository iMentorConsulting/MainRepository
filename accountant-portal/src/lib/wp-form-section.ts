// The text block above the Bitform at the end of every program page, and the
// #form anchor. The Bitform itself is a separate Elementor widget placed right
// AFTER the HTML widget, so the anchor must be the very last element of the HTML:
// visitors then land exactly on the form instead of on the intro text.

export const COMPACT_FORM_SECTION = `<section class="imx-form-intro" aria-labelledby="form-title" style="background:#fff;border-top:1px solid var(--imx-line);padding:24px 0 0;text-align:center"><div class="imx-wrap" style="max-width:560px"><h2 id="form-title" style="font-size:clamp(19px,5vw,25px);font-weight:800;letter-spacing:-.01em;color:var(--imx-ink);margin:0 0 6px;line-height:1.25">Δωρεάν έλεγχος επιλεξιμότητας</h2><p style="font-size:14.5px;color:var(--imx-muted);margin:0 0 6px;line-height:1.5">Συμπληρώστε τη φόρμα και θα επικοινωνήσουμε άμεσα.</p><p style="font-size:11.5px;color:var(--imx-muted);margin:0;line-height:1.4">Με την υποβολή συμφωνείτε να επικοινωνήσει μαζί σας η i-Mentor (GDPR).</p></div></section><div id="form" style="scroll-margin-top:72px;height:1px;background:#fff"></div>`

// Replaces the old form-intro section (the one carrying id="form") inside an
// imx-page HTML string. Returns null when there is nothing to do: already
// compact, or no such section found.
export function patchFormSection(html: string): { html: string } | { skipped: 'already-compact' | 'no-form-section' } {
  if (html.includes('imx-form-intro')) return { skipped: 'already-compact' }
  const re = /<section\b[^>]*\bid="form"[^>]*>[\s\S]*?<\/section>/
  if (!re.test(html)) return { skipped: 'no-form-section' }
  return { html: html.replace(re, () => COMPACT_FORM_SECTION) }
}
