import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  ArrowPathIcon, LinkIcon, ClipboardDocumentIcon, CheckIcon,
  CloudArrowUpIcon, CloudArrowDownIcon, PencilIcon,
} from '@heroicons/react/24/outline'
import {
  getIcalUnits, syncIcalUnit, syncIcalAll,
  getIcalExportUrl, regenerateIcalToken, updateIcalImportUrl,
} from '../api'

const BASE_URL = window.location.origin

const PLATFORM_GUIDES = [
  { name: 'Airbnb', logo: '🏠', step: 'Go to Listing → Calendar → Availability Settings → Import Calendar and paste the URL.' },
  { name: 'Booking.com', logo: '🅱️', step: 'Go to Property → Rates & Availability → Calendar Sync → Add Feed URL.' },
  { name: 'VRBO / HomeAway', logo: '🏡', step: 'Go to Calendar → Import → Add iCal URL and paste the link.' },
  { name: 'Expedia', logo: '✈️', step: 'Go to Calendar → Manage → iCal Export/Import and add the feed.' },
]

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} title="Αντιγραφή"
      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0">
      {copied ? <><CheckIcon className="h-3.5 w-3.5 text-green-600" /> Copied!</> : <><ClipboardDocumentIcon className="h-3.5 w-3.5" /> Copy</>}
    </button>
  )
}

function UnitRow({ unit, onSynced }) {
  const [exportToken, setExportToken] = useState(unit.ical_export_token || '')
  const [importUrl, setImportUrl] = useState(unit.ical_url || '')
  const [editingImport, setEditingImport] = useState(false)
  const [draftImport, setDraftImport] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(false)

  const exportUrl = exportToken ? `${BASE_URL}/api/ical/feed/${exportToken}` : ''

  const ensureExportToken = async () => {
    if (exportToken) return exportToken
    setLoading(true)
    try {
      const r = await getIcalExportUrl(unit.id)
      setExportToken(r.data.ical_export_token)
      return r.data.ical_export_token
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateToken = async () => {
    await ensureExportToken()
  }

  const handleRegenerateToken = async () => {
    if (!confirm('Regenerating the token will break any existing platform subscriptions. Continue?')) return
    setLoading(true)
    try {
      const r = await regenerateIcalToken(unit.id)
      setExportToken(r.data.ical_export_token)
      toast.success('Token regenerated')
    } catch {
      toast.error('Error regenerating token')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveImport = async () => {
    try {
      await updateIcalImportUrl(unit.id, draftImport.trim())
      setImportUrl(draftImport.trim())
      setEditingImport(false)
      toast.success('Import URL saved')
    } catch {
      toast.error('Error saving URL')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const r = await syncIcalUnit(unit.id)
      toast.success(`Sync OK — +${r.data.added} added, ~${r.data.updated} updated`)
      onSynced?.()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-800">{unit.name}</p>
          <p className="text-xs text-gray-400 capitalize">{unit.type}</p>
        </div>
        <button onClick={handleSync} disabled={syncing || !importUrl}
          className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
          <ArrowPathIcon className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {/* Export (our URL → platforms import this) */}
      <div className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CloudArrowUpIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-green-800">Export URL — paste into platform calendars</span>
        </div>
        {exportToken ? (
          <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
            <code className="text-xs text-gray-700 flex-1 break-all">{exportUrl}</code>
            <CopyButton value={exportUrl} />
          </div>
        ) : (
          <button onClick={handleGenerateToken} disabled={loading}
            className="text-xs font-medium text-green-700 underline hover:no-underline">
            {loading ? 'Generating…' : 'Generate export URL'}
          </button>
        )}
        {exportToken && (
          <button onClick={handleRegenerateToken} disabled={loading}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            Regenerate token (breaks existing subscriptions)
          </button>
        )}
      </div>

      {/* Import (platform URL → we pull from this) */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CloudArrowDownIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-blue-800">Import URL — platform's iCal feed we sync from</span>
        </div>
        {editingImport ? (
          <div className="space-y-2">
            <input type="url" value={draftImport} onChange={e => setDraftImport(e.target.value)}
              placeholder="https://www.airbnb.com/calendar/ical/…"
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-400" />
            <div className="flex gap-2">
              <button onClick={handleSaveImport} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">Save</button>
              <button onClick={() => setEditingImport(false)} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {importUrl ? (
              <code className="text-xs text-gray-700 flex-1 truncate">{importUrl}</code>
            ) : (
              <span className="text-xs text-gray-400 flex-1">No import URL set</span>
            )}
            <button onClick={() => { setDraftImport(importUrl); setEditingImport(true) }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0 px-2 py-1 rounded-lg hover:bg-blue-100">
              <PencilIcon className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Sync() {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncingAll, setSyncingAll] = useState(false)

  const load = async () => {
    try {
      const r = await getIcalUnits()
      setUnits(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSyncAll = async () => {
    setSyncingAll(true)
    try {
      const r = await syncIcalAll()
      toast.success(`Sync all — +${r.data.total_added} added, ~${r.data.total_updated} updated`)
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncingAll(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-800">Συγχρονισμός Πλατφορμών</h2>
        </div>
        <button onClick={handleSyncAll} disabled={syncingAll}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <ArrowPathIcon className={`h-4 w-4 ${syncingAll ? 'animate-spin' : ''}`} />
          {syncingAll ? 'Syncing all…' : 'Sync All Units'}
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Πώς λειτουργεί το iCal Sync</p>
        <p>• <strong>Export URL</strong>: Δώστε αυτό το URL στις πλατφόρμες (Airbnb, Booking, VRBO) ώστε να εισάγουν τις κρατήσεις σας.</p>
        <p>• <strong>Import URL</strong>: Το URL iCal της πλατφόρμας από το οποίο εισάγουμε κρατήσεις κάθε 6 ώρες αυτόματα.</p>
        <p>• Ο αυτόματος συγχρονισμός τρέχει κάθε 6 ώρες. Μπορείτε επίσης να πατήσετε "Sync Now" ανά μονάδα.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : units.length === 0 ? (
        <p className="text-center text-gray-400 py-12">Δεν υπάρχουν ενεργές μονάδες.</p>
      ) : (
        <div className="space-y-4">
          {units.map(u => (
            <UnitRow key={u.id} unit={u} onSynced={load} />
          ))}
        </div>
      )}

      {/* Platform guides */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">Οδηγίες ανά πλατφόρμα</h3>
          <p className="text-xs text-gray-500 mt-0.5">Πώς να συνδέσετε το Export URL σε κάθε πλατφόρμα</p>
        </div>
        <div className="divide-y divide-gray-50">
          {PLATFORM_GUIDES.map(p => (
            <div key={p.name} className="flex items-start gap-3 px-5 py-4">
              <span className="text-2xl flex-shrink-0">{p.logo}</span>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.step}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
