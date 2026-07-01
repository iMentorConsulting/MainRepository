import { useState, useEffect } from 'react'
import {
  getLeadSheetConfigs, saveLeadSheetConfig, previewLeadSync, runLeadSyncProgram, runLeadSync, getLeadSyncStatus,
} from '../api'
import { ArrowPathIcon, EyeIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROGRAMS = ['ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΔΥΠΑ', 'ΕΣΠΑ', 'ΑΝΑΚΑΙΝΙΖΩ']
const LOGICAL_FIELDS = ['name', 'phone', 'phone2', 'email', 'afm', 'service_type', 'total_amount', 'source', 'notes', 'assigned_to', 'next_call_date', 'status', 'created_date']

function ConfigCard({ program, initial, onSaved }) {
  const [cfg, setCfg] = useState(initial || { program, spreadsheet_id: '', sheet_tab: '', header_row: 1, column_map: {}, program_field_map: {}, enabled: true, last_sync_at: null, last_row_num: 0 })
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  const setCol = (field, letter) => setCfg(c => ({ ...c, column_map: { ...c.column_map, [field]: letter } }))

  const [pfRows, setPfRows] = useState(() =>
    Object.entries(initial?.program_field_map || {}).map(([ref, meta]) => ({ ref, key: meta?.key || '', label: meta?.label || '' }))
  )

  const buildPfMap = () => {
    const map = {}
    pfRows.forEach(r => { if (r.ref) map[r.ref] = { key: r.key || r.ref, label: r.label || r.key || r.ref } })
    return map
  }

  const save = async (extra = {}) => {
    setBusy(true)
    try {
      const payload = {
        spreadsheet_id: cfg.spreadsheet_id, sheet_tab: cfg.sheet_tab, header_row: Number(cfg.header_row) || 1,
        column_map: cfg.column_map, program_field_map: buildPfMap(), enabled: cfg.enabled, ...extra,
      }
      const saved = await saveLeadSheetConfig(program, payload)
      setCfg(saved)
      toast.success(`Αποθηκεύτηκε: ${program}`)
      onSaved?.()
    } catch { toast.error('Σφάλμα αποθήκευσης') } finally { setBusy(false) }
  }

  const doPreview = async () => {
    setBusy(true)
    try { const res = await previewLeadSync(program); setPreview(res) }
    catch (e) { toast.error(e.response?.data?.detail || 'Σφάλμα preview') } finally { setBusy(false) }
  }
  const doRun = async () => {
    if (!confirm(`Εισαγωγή νέων leads από το sheet του ${program};`)) return
    setBusy(true)
    try { const res = await runLeadSyncProgram(program); toast.success(`Εισήχθησαν ${res.imported} leads`); onSaved?.() }
    catch (e) { toast.error(e.response?.data?.detail || 'Σφάλμα sync') } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-gray-800">{program}</div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={cfg.enabled} onChange={e => set('enabled', e.target.checked)} />Ενεργό
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <input placeholder="Spreadsheet ID" value={cfg.spreadsheet_id || ''} onChange={e => set('spreadsheet_id', e.target.value)} className="col-span-2 px-2 py-1.5 border rounded text-sm" />
        <input placeholder="Tab (π.χ. Sheet1)" value={cfg.sheet_tab || ''} onChange={e => set('sheet_tab', e.target.value)} className="px-2 py-1.5 border rounded text-sm" />
        <label className="text-sm text-gray-500 flex items-center gap-1">Header row:
          <input type="number" value={cfg.header_row || 1} onChange={e => set('header_row', e.target.value)} className="w-16 px-2 py-1 border rounded text-sm" />
        </label>
        <div className="col-span-2 text-xs text-gray-400 self-center">
          {cfg.last_sync_at ? `Τελ. sync: ${new Date(cfg.last_sync_at).toLocaleString('el-GR')} · watermark γρ. ${cfg.last_row_num}` : 'Δεν έχει συγχρονιστεί'}
        </div>
      </div>

      <div className="text-xs font-semibold text-gray-500 mb-1">Αντιστοίχιση στηλών (γράμμα στήλης π.χ. B, ή όνομα κεφαλίδας)</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {LOGICAL_FIELDS.map(f => (
          <div key={f} className="flex items-center gap-1">
            <span className="text-xs text-gray-500 w-24 shrink-0">{f}</span>
            <input value={cfg.column_map?.[f] || ''} onChange={e => setCol(f, e.target.value)} className="flex-1 px-2 py-1 border rounded text-sm" placeholder="—" />
          </div>
        ))}
      </div>

      <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-2">
        Ειδικά πεδία προγράμματος
        <button onClick={() => setPfRows(r => [...r, { ref: '', key: '', label: '' }])} className="text-blue-600"><PlusIcon className="w-3.5 h-3.5" /></button>
      </div>
      {pfRows.map((r, i) => (
        <div key={i} className="grid grid-cols-4 gap-2 mb-1">
          <input placeholder="Στήλη/κεφαλίδα" value={r.ref} onChange={e => setPfRows(rs => rs.map((x, j) => j === i ? { ...x, ref: e.target.value } : x))} className="px-2 py-1 border rounded text-sm" />
          <input placeholder="key" value={r.key} onChange={e => setPfRows(rs => rs.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} className="px-2 py-1 border rounded text-sm" />
          <input placeholder="Ετικέτα" value={r.label} onChange={e => setPfRows(rs => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="px-2 py-1 border rounded text-sm" />
          <button onClick={() => setPfRows(rs => rs.filter((_, j) => j !== i))} className="text-red-500 justify-self-start p-1"><TrashIcon className="w-4 h-4" /></button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={() => save()} disabled={busy} className="btn-primary text-sm">Αποθήκευση</button>
        <button onClick={doPreview} disabled={busy} className="btn-secondary text-sm flex items-center gap-1"><EyeIcon className="w-4 h-4" />Preview</button>
        <button onClick={doRun} disabled={busy} className="btn-secondary text-sm flex items-center gap-1"><ArrowPathIcon className="w-4 h-4" />Sync τώρα</button>
        <button onClick={() => save({ reset_watermark: true })} disabled={busy} className="text-sm text-gray-400 hover:text-gray-600">Reset watermark</button>
      </div>

      {preview && (() => {
        const pp = preview.per_program?.[0]
        const rows = pp?.preview || []
        return (
          <div className="mt-3 border-t pt-2">
            {preview.note && <div className="text-xs text-amber-700 mb-1">⚠ {preview.note}</div>}
            {pp?.error && <div className="text-xs text-red-600 mb-1">⚠ {pp.error}</div>}
            {pp && !pp.error && (
              <div className="text-xs text-gray-500 mb-1">
                Preview: <b>{rows.length}</b> νέες γραμμές · διαβάστηκαν {pp.total_rows} γραμμές
                ({pp.data_rows} με δεδομένα, {pp.already_imported} ήδη εισηγμένες, {pp.skipped_empty} κενές) · tab «{pp.tab || '—'}»
              </div>
            )}
            {!pp && !preview.note && <div className="text-xs text-gray-500 mb-1">Preview: 0 νέες γραμμές</div>}
            <div className="max-h-40 overflow-y-auto text-xs">
              {rows.map((row, i) => (
                <div key={i} className="border-b py-1">γρ.{row.row_num} [{row.status}]: {row.name || '—'} · {row.phone || ''} · {row.email || ''}</div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default function LeadSheetConfigPage() {
  const [configs, setConfigs] = useState([])
  const [status, setStatus] = useState(null)

  const load = () => { getLeadSheetConfigs().then(setConfigs).catch(() => {}); getLeadSyncStatus().then(setStatus).catch(() => {}) }
  useEffect(() => { load() }, [])

  const byProgram = Object.fromEntries(configs.map(c => [c.program, c]))

  const runAll = async () => {
    if (!confirm('Sync όλων των προγραμμάτων;')) return
    try { const res = await runLeadSync(); toast.success(`Εισήχθησαν ${res.imported} leads συνολικά`); load() }
    catch { toast.error('Σφάλμα sync') }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Leads — Ρυθμίσεις Google Sheets</h1>
        <button onClick={runAll} className="btn-primary text-sm flex items-center gap-1"><ArrowPathIcon className="w-4 h-4" />Sync όλων</button>
      </div>
      {status?.last_run_at && (
        <div className="text-sm text-gray-500 mb-3">Τελευταίο sync: {new Date(status.last_run_at).toLocaleString('el-GR')} · imported {status.imported}</div>
      )}
      <div className="space-y-4">
        {PROGRAMS.map(p => (
          <ConfigCard key={p} program={p} initial={byProgram[p]} onSaved={load} />
        ))}
      </div>
    </div>
  )
}
