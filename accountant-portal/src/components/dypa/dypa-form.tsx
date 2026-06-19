'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Building2, Briefcase, ShieldCheck, FileSignature, Lock, Banknote, Rocket, CheckCircle2, PlusCircle, Trash2 } from 'lucide-react'

const TERMS = [
  'Η αίτηση υπόκειται σε τελική έγκριση από τη ΔΥΠΑ και η I-MENTOR δεν εγγυάται την έκβαση.',
  'Τα στοιχεία που δηλώνονται στη φόρμα είναι ακριβή και η επιχείρηση φέρει την ευθύνη ορθότητάς τους.',
  'Η επιχείρηση δεσμεύεται να ενημερώσει άμεσα την I-MENTOR για κάθε μεταβολή στα στοιχεία της θέσης ή του προσωπικού.',
  'Η αμοιβή της I-MENTOR περιλαμβάνει την αρχική υποβολή και την περιοδική παρακολούθηση του φακέλου ανά δίμηνο.',
  'Σε περίπτωση μη τήρησης των όρων του προγράμματος, η ευθύνη τυχόν επιστροφής της επιδότησης βαρύνει αποκλειστικά την επιχείρηση.',
  'Τα κατατεθέντα ποσά δεν επιστρέφονται σε περίπτωση απόρριψης λόγω ανακριβών στοιχείων που δήλωσε η επιχείρηση.',
  'Η επιχείρηση αποδέχεται την ηλεκτρονική επικοινωνία και την αποστολή εγγράφων μέσω email/Viber.',
]

export interface DypaFormValue {
  ownerIsLegalEntity: boolean
  ownerLegalEntityName: string | null
  existingStaffCount: number | null
  existingStaffNotes: string | null
  affiliatedCompanies: { name: string; afm: string; ownershipPct: string }[] | null
  positionTitle: string | null
  positionDescription: string | null
  requiresLicense: boolean
  licenseDescription: string | null
  requiresForeignLanguage: boolean
  foreignLanguageDescription: string | null
  noRecentLaborFines: boolean
  genderEqualityPrinciple: boolean
  noRecentStaffReduction: boolean
  declarationSoreusis: boolean
  declarationMiAnaktisis: boolean
  declarationDeMinimis: boolean
  termsAcceptedAt: string | null
  finalAcceptedAt: string | null
  hireStartDate: string | null
  taxisnetUsernameSet: boolean
  taxisnetPasswordSet: boolean
  initialFeeStatus: string
  recurringFeeActive: boolean
  billingCycleCount: number
  status: string
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500'
const labelCls = 'text-sm font-medium text-gray-700 mb-1 block'

export function DypaForm({
  value, onPatch, onSubmitTaxisnet, onAcceptTerms, onFinalAccept, onSetHireStartDate,
  pricing, canSetHireDate, canConfirmPayment, onConfirmPayment, showTaxisnet = true, saving,
}: {
  value: DypaFormValue
  onPatch: (patch: Record<string, any>) => Promise<void> | void
  onSubmitTaxisnet: (username: string, password: string) => Promise<void> | void
  onAcceptTerms: () => Promise<void> | void
  onFinalAccept: (businessClaimsPaid: boolean) => Promise<void> | void
  onSetHireStartDate: (date: string) => Promise<void> | void
  pricing?: { initialFeeCents: number; recurringFeeCents: number; ibanHolderName: string; ibanPiraeus: string; ibanEurobank: string; ibanAlpha: string }
  canSetHireDate: boolean
  canConfirmPayment?: boolean
  onConfirmPayment?: () => Promise<void> | void
  showTaxisnet?: boolean
  saving?: boolean
}) {
  const [affiliated, setAffiliated] = useState(value.affiliatedCompanies || [])
  const [taxisnetUser, setTaxisnetUser] = useState('')
  const [taxisnetPass, setTaxisnetPass] = useState('')
  const [hireDate, setHireDate] = useState(value.hireStartDate ? value.hireStartDate.slice(0, 10) : '')
  const [termsChecked, setTermsChecked] = useState<boolean[]>(TERMS.map(() => !!value.termsAcceptedAt))
  const [finalChecked, setFinalChecked] = useState(!!value.finalAcceptedAt)
  const [businessClaimsPaid, setBusinessClaimsPaid] = useState(false)

  const locked = !!value.finalAcceptedAt

  function addAffiliated() {
    setAffiliated(a => [...a, { name: '', afm: '', ownershipPct: '' }])
  }
  function updateAffiliated(i: number, field: string, v: string) {
    setAffiliated(a => a.map((row, idx) => idx === i ? { ...row, [field]: v } : row))
  }
  function removeAffiliated(i: number) {
    setAffiliated(a => a.filter((_, idx) => idx !== i))
  }

  const euro = (cents: number) => (cents / 100).toLocaleString('el-GR', { minimumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <Building2 size={18} className="text-indigo-600" /> 1. Στοιχεία Επιχείρησης
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.ownerIsLegalEntity}
              onChange={e => onPatch({ ownerIsLegalEntity: e.target.checked })} />
            Ο ιδιοκτήτης/μέτοχος ≥25% είναι νομικό πρόσωπο
          </label>
          {value.ownerIsLegalEntity && (
            <div>
              <label className={labelCls}>Επωνυμία νομικού προσώπου</label>
              <input disabled={locked} className={inputCls} value={value.ownerLegalEntityName || ''}
                onChange={e => onPatch({ ownerLegalEntityName: e.target.value })} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Υφιστάμενο προσωπικό (αριθμός)</label>
              <input disabled={locked} type="number" className={inputCls} value={value.existingStaffCount ?? ''}
                onChange={e => onPatch({ existingStaffCount: e.target.value ? parseInt(e.target.value) : null })} />
            </div>
            <div>
              <label className={labelCls}>Σημειώσεις προσωπικού</label>
              <input disabled={locked} className={inputCls} value={value.existingStaffNotes || ''}
                onChange={e => onPatch({ existingStaffNotes: e.target.value })} placeholder="π.χ. τύποι απασχόλησης" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + ' mb-0'}>Συνδεδεμένες επιχειρήσεις (≥25% συμμετοχή)</label>
              {!locked && (
                <button type="button" onClick={addAffiliated} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
                  <PlusCircle size={14} /> Προσθήκη
                </button>
              )}
            </div>
            <div className="space-y-2">
              {affiliated.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_90px_auto] gap-2">
                  <input disabled={locked} className={inputCls} placeholder="Επωνυμία" value={row.name}
                    onChange={e => updateAffiliated(i, 'name', e.target.value)} />
                  <input disabled={locked} className={inputCls} placeholder="ΑΦΜ" value={row.afm}
                    onChange={e => updateAffiliated(i, 'afm', e.target.value)} />
                  <input disabled={locked} className={inputCls} placeholder="%" value={row.ownershipPct}
                    onChange={e => updateAffiliated(i, 'ownershipPct', e.target.value)} />
                  {!locked && (
                    <button type="button" onClick={() => removeAffiliated(i)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
            </div>
            {!locked && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => onPatch({ affiliatedCompanies: affiliated })}>
                Αποθήκευση Συνδεδεμένων
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <Briefcase size={18} className="text-indigo-600" /> 2. Στοιχεία Θέσης Εργασίας
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className={labelCls}>Τίτλος θέσης *</label>
            <input disabled={locked} className={inputCls} value={value.positionTitle || ''}
              onChange={e => onPatch({ positionTitle: e.target.value })} placeholder="π.χ. Βοηθός Λογιστή" />
          </div>
          <div>
            <label className={labelCls}>Περιγραφή καθηκόντων</label>
            <textarea disabled={locked} rows={3} className={inputCls} value={value.positionDescription || ''}
              onChange={e => onPatch({ positionDescription: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.requiresLicense}
              onChange={e => onPatch({ requiresLicense: e.target.checked })} />
            Απαιτείται άδεια άσκησης επαγγέλματος
          </label>
          {value.requiresLicense && (
            <input disabled={locked} className={inputCls} value={value.licenseDescription || ''}
              onChange={e => onPatch({ licenseDescription: e.target.value })} placeholder="Είδος άδειας" />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.requiresForeignLanguage}
              onChange={e => onPatch({ requiresForeignLanguage: e.target.checked })} />
            Απαιτείται ξένη γλώσσα
          </label>
          {value.requiresForeignLanguage && (
            <input disabled={locked} className={inputCls} value={value.foreignLanguageDescription || ''}
              onChange={e => onPatch({ foreignLanguageDescription: e.target.value })} placeholder="π.χ. Αγγλικά - επίπεδο Β2" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <ShieldCheck size={18} className="text-indigo-600" /> 3. Αυτοδηλούμενες Προϋποθέσεις
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.noRecentLaborFines}
              onChange={e => onPatch({ noRecentLaborFines: e.target.checked })} />
            Δεν έχω πρόστιμα εργατικής νομοθεσίας πρόσφατα (ν.4488/2017)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.genderEqualityPrinciple}
              onChange={e => onPatch({ genderEqualityPrinciple: e.target.checked })} />
            Τηρώ την αρχή της ισότητας των φύλων
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.noRecentStaffReduction}
              onChange={e => onPatch({ noRecentStaffReduction: e.target.checked })} />
            Δεν έχω μειώσει προσωπικό πρόσφατα
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <FileSignature size={18} className="text-indigo-600" /> 4. Δηλώσεις
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.declarationSoreusis}
              onChange={e => onPatch({ declarationSoreusis: e.target.checked })} />
            Υπεύθυνη Δήλωση Σώρευσης Ενισχύσεων
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.declarationMiAnaktisis}
              onChange={e => onPatch({ declarationMiAnaktisis: e.target.checked })} />
            Υπεύθυνη Δήλωση Μη Ανάκτησης Ενίσχυσης
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.declarationDeMinimis}
              onChange={e => onPatch({ declarationDeMinimis: e.target.checked })} />
            Δήλωση De minimis (Καν. 2831/2023)
          </label>
        </CardContent>
      </Card>

      {showTaxisnet && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
              <Lock size={18} className="text-indigo-600" /> 5. Κωδικοί Taxisnet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              Οι κωδικοί αποθηκεύονται κρυπτογραφημένα και χρησιμοποιούνται αποκλειστικά για την υποβολή της αίτησης στη ΔΥΠΑ.
            </div>
            {(value.taxisnetUsernameSet && value.taxisnetPasswordSet && !taxisnetUser && !taxisnetPass) ? (
              <p className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> Έχουν ήδη καταχωρηθεί.</p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Όνομα χρήστη Taxisnet</label>
                <input disabled={locked} autoComplete="off" className={inputCls} value={taxisnetUser} onChange={e => setTaxisnetUser(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Κωδικός Taxisnet</label>
                <input disabled={locked} type="password" autoComplete="new-password" className={inputCls} value={taxisnetPass} onChange={e => setTaxisnetPass(e.target.value)} />
              </div>
            </div>
            {!locked && (taxisnetUser || taxisnetPass) && (
              <Button size="sm" variant="outline" onClick={() => onSubmitTaxisnet(taxisnetUser, taxisnetPass)}>Αποθήκευση Κωδικών</Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <FileSignature size={18} className="text-indigo-600" /> 6. Όροι Συνεργασίας
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-gray-200 divide-y">
            {TERMS.map((term, i) => (
              <label key={i} className="flex items-start gap-2 p-3 text-sm text-gray-700">
                <input type="checkbox" disabled={locked || !!value.termsAcceptedAt} className="mt-0.5" checked={termsChecked[i]}
                  onChange={e => setTermsChecked(t => t.map((v, idx) => idx === i ? e.target.checked : v))} />
                <span><strong>{i + 1}.</strong> {term}</span>
              </label>
            ))}
          </div>
          {value.termsAcceptedAt ? (
            <p className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> Οι όροι έχουν γίνει αποδεκτοί στις {new Date(value.termsAcceptedAt).toLocaleString('el-GR')}</p>
          ) : (
            <Button size="sm" disabled={!termsChecked.every(Boolean)} onClick={onAcceptTerms}>Αποδοχή Όρων</Button>
          )}
        </CardContent>
      </Card>

      {pricing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
              <Banknote size={18} className="text-indigo-600" /> 7. Πληρωμή
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-900">
              <p className="font-semibold">Αρχική προκαταβολή υποβολής: €{euro(pricing.initialFeeCents)} (+ΦΠΑ)</p>
              <p className="text-xs mt-1 text-indigo-700">Μετά την έγκριση & πρόσληψη, ισχύει επιπλέον αμοιβή παρακολούθησης €{euro(pricing.recurringFeeCents)} ανά δίμηνο.</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              {pricing.ibanPiraeus && <IbanBox bank="Τράπεζα Πειραιώς" iban={pricing.ibanPiraeus} holder={pricing.ibanHolderName} />}
              {pricing.ibanEurobank && <IbanBox bank="Eurobank" iban={pricing.ibanEurobank} holder={pricing.ibanHolderName} />}
              {pricing.ibanAlpha && <IbanBox bank="Alpha Bank" iban={pricing.ibanAlpha} holder={pricing.ibanHolderName} />}
            </div>
            {value.initialFeeStatus === 'PAID' ? (
              <p className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> Η προκαταβολή έχει επιβεβαιωθεί.</p>
            ) : (
              <>
                {!value.finalAcceptedAt && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={businessClaimsPaid} onChange={e => setBusinessClaimsPaid(e.target.checked)} />
                    Πραγματοποίησα την τραπεζική κατάθεση
                  </label>
                )}
                {canConfirmPayment && (
                  <Button size="sm" variant="outline" onClick={onConfirmPayment}>Επιβεβαίωση Πληρωμής (Admin)</Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!value.finalAcceptedAt ? (
        <Card className="border-indigo-200">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={finalChecked} onChange={e => setFinalChecked(e.target.checked)} disabled={!value.termsAcceptedAt} />
              Επιβεβαιώνω ότι όλα τα στοιχεία είναι ακριβή και υποβάλλω την αίτηση ανάθεσης
            </label>
            <Button disabled={!finalChecked || !value.termsAcceptedAt || saving} loading={saving}
              onClick={() => onFinalAccept(businessClaimsPaid)}>
              <Rocket size={16} className="mr-1" /> Οριστική Υποβολή
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-emerald-800 flex items-center gap-1 font-medium">
              <CheckCircle2 size={16} /> Η αίτηση υποβλήθηκε στις {new Date(value.finalAcceptedAt).toLocaleString('el-GR')}
            </p>
            {canSetHireDate && (
              <div className="flex items-end gap-3">
                <div>
                  <label className={labelCls}>Ημερομηνία πρόσληψης ανέργου</label>
                  <input type="date" className={inputCls} value={hireDate} onChange={e => setHireDate(e.target.value)} disabled={!!value.hireStartDate} />
                </div>
                {!value.hireStartDate && (
                  <Button size="sm" disabled={!hireDate} onClick={() => onSetHireStartDate(hireDate)}>Καταχώριση Πρόσληψης</Button>
                )}
                {value.hireStartDate && (
                  <Badge variant="success">Ξεκίνησε ο δίμηνος κύκλος παρακολούθησης (#{value.billingCycleCount})</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function IbanBox({ bank, iban, holder }: { bank: string; iban: string; holder: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="font-semibold text-gray-700">{bank}</p>
      <p className="font-mono text-gray-900 mt-1">{iban}</p>
      <p className="text-gray-400 mt-1">{holder}</p>
    </div>
  )
}
