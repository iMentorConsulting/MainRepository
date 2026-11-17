'use client'
import { AlertTriangle, ExternalLink, X } from 'lucide-react'

// Mandatory de-minimis check before the Microcredits eligibility analysis:
// the consultant must look the ΑΦΜ up in the national de-minimis register
// (sorefsis.gr) first. Clicking the main button is a fresh user gesture, so
// copying the ΑΦΜ and opening the site from here isn't blocked by the browser.
export const SOREFSIS_URL = 'https://sorefsis.gr/'

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch { /* fall through to the legacy path */ }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  } catch { /* clipboard unavailable — the ΑΦΜ is shown in the dialog to copy by hand */ }
}

export function SorefsisCheckModal({ afm, onConfirm, onSkip, onCancel }: {
  afm: string
  // OK: ΑΦΜ copied + sorefsis.gr opened in a new tab, then continue to the analysis.
  onConfirm: () => void
  // "Έχω ήδη ελέγξει": continue without opening the site.
  onSkip: () => void
  onCancel: () => void
}) {
  async function ok() {
    await copyText(afm)
    window.open(SOREFSIS_URL, '_blank', 'noopener')
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500 shrink-0" />
            <h2 className="text-base font-semibold text-gray-900">Έλεγχος de minimis (sorefsis)</h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          Πριν την ανάλυση επιλεξιμότητας πρέπει να ελέγξετε στο <strong>sorefsis.gr</strong> αν η επιχείρηση έχει λάβει ενισχύσεις de minimis.
        </p>
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
          ΑΦΜ: <span className="font-mono font-semibold">{afm}</span>
          <span className="block text-xs text-gray-500 mt-0.5">Με το OK το ΑΦΜ αντιγράφεται και ανοίγει το sorefsis.gr — επικολλήστε το στο πεδίο «Για άμεση αναζήτηση με ΑΦΜ».</span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <button onClick={onSkip} className="text-xs text-gray-500 hover:underline">Έχω ήδη ελέγξει — συνέχεια</button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Ακύρωση</button>
            <button onClick={ok} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
              <ExternalLink size={14} /> OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
