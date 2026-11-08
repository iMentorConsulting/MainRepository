import { useState, useEffect, useMemo } from 'react'
import {
  getCaseDocChecklists,
  getCaseDocChecklist,
  updateCaseDocChecklist,
  deleteCaseDocChecklist,
  updateCaseDocChecklistItem,
  getAuth,
} from '../api'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  EyeSlashIcon,
  TrashIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const REQ_COLORS = {
  ΥΠΟΧΡΕΩΤΙΚΟ: 'bg-red-100 text-red-700',
  ΥΠΟ_ΠΡΟΫΠΟΘΕΣΗ: 'bg-orange-100 text-orange-700',
  ΕΝΑΛΛΑΚΤΙΚΑ: 'bg-yellow-100 text-yellow-700',
  ΓΙΑ_ΒΑΘΜΟΛΟΓΗΣΗ: 'bg-blue-100 text-blue-700',
  ΠΡΟΑΙΡΕΤΙΚΟ: 'bg-gray-100 text-gray-500',
}

const REQ_LABELS = {
  ΥΠΟΧΡΕΩΤΙΚΟ: 'Υποχρεωτικό',
  ΥΠΟ_ΠΡΟΫΠΟΘΕΣΗ: 'Υπό Προϋπόθεση',
  ΕΝΑΛΛΑΚΤΙΚΑ: 'Εναλλακτικό',
  ΓΙΑ_ΒΑΘΜΟΛΟΓΗΣΗ: 'Για Βαθμολόγηση',
  ΠΡΟΑΙΡΕΤΙΚΟ: 'Προαιρετικό',
}

function ChecklistItem({ item, checklistId, caseId, onUpdated }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  const toggle = async (field, value) => {
    setSaving(true)
    try {
      const updated = await updateCaseDocChecklistItem(caseId, checklistId, item.id, { [field]: value })
      onUpdated(updated)
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  const reqColor = REQ_COLORS[item.requirement_type] || 'bg-gray-100 text-gray-500'

  return (
    <div className={`border rounded-xl transition-all ${!item.is_applicable ? 'opacity-40 bg-gray-50 border-gray-100' : item.is_received ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-3 p-3">
        {/* Received toggle */}
        <button
          onClick={() => toggle('is_received', !item.is_received)}
          disabled={saving || !item.is_applicable}
          title={item.is_received ? 'Παρελήφθη — κάντε κλικ για αναίρεση' : 'Σημείωση ως παραληφθέν'}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            item.is_received
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-300 hover:border-green-400'
          } disabled:cursor-default`}
        >
          {item.is_received && <CheckCircleIcon className="w-4 h-4" />}
        </button>

        {/* Expand trigger */}
        <button className="text-gray-400 flex-shrink-0" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-2 flex-wrap">
            {item.item_code && (
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.item_code}</span>
            )}
            <span className={`text-sm font-semibold ${item.is_received ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {item.title}
            </span>
          </div>
          {item.condition_notes && !expanded && (
            <p className="text-xs text-orange-600 mt-0.5 italic truncate">{item.condition_notes}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${reqColor} hidden sm:inline-block`}>
            {REQ_LABELS[item.requirement_type] || item.requirement_type}
          </span>
          {/* Applicable toggle */}
          <button
            onClick={() => toggle('is_applicable', !item.is_applicable)}
            disabled={saving}
            title={item.is_applicable ? 'Δεν εφαρμόζεται για αυτόν τον πελάτη' : 'Εφαρμόζεται'}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              item.is_applicable
                ? 'border-gray-200 text-gray-400 hover:border-orange-300 hover:text-orange-500'
                : 'border-orange-300 bg-orange-50 text-orange-500 hover:border-gray-200 hover:text-gray-400'
            }`}
          >
            {item.is_applicable ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-10 pb-3 pt-1 border-t border-gray-100 mx-2 space-y-2">
          {item.condition_notes && (
            <p className="text-xs text-orange-600 italic">▸ {item.condition_notes}</p>
          )}
          {item.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function DocChecklistTab({ caseId, caseData, onChecklistHidden }) {
  const [checklists, setChecklists] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [checklist, setChecklist] = useState(null)
  const [loading, setLoading] = useState(true)
  const auth = getAuth()
  const isAdmin = auth?.role === 'admin'

  useEffect(() => {
    setLoading(true)
    getCaseDocChecklists(caseId)
      .then(rows => {
        const active = rows.filter(r => r.status === 'active')
        setChecklists(active)
        if (active.length > 0) setActiveId(active[0].id)
      })
      .catch(() => toast.error('Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false))
  }, [caseId])

  useEffect(() => {
    if (!activeId) return
    getCaseDocChecklist(caseId, activeId).then(setChecklist).catch(() => {})
  }, [activeId, caseId])

  const handleItemUpdated = (updated) => {
    setChecklist(c => ({
      ...c,
      items: c.items.map(i => i.id === updated.id ? updated : i),
    }))
  }

  const handleHide = async () => {
    if (!confirm('Απόκρυψη λίστας δικαιολογητικών για αυτή την υπόθεση; Μπορείτε να την επαναφέρετε από τη Βιβλιοθήκη.')) return
    await updateCaseDocChecklist(caseId, activeId, { status: 'hidden' })
    const remaining = checklists.filter(c => c.id !== activeId)
    setChecklists(remaining)
    setActiveId(remaining[0]?.id || null)
    setChecklist(null)
    toast.success('Αποκρύφθηκε')
    if (remaining.length === 0 && onChecklistHidden) onChecklistHidden()
  }

  const handleDelete = async () => {
    if (!confirm('Οριστική διαγραφή λίστας δικαιολογητικών; Η ενέργεια δεν αναιρείται.')) return
    await deleteCaseDocChecklist(caseId, activeId)
    const remaining = checklists.filter(c => c.id !== activeId)
    setChecklists(remaining)
    setActiveId(remaining[0]?.id || null)
    setChecklist(null)
    toast.success('Διαγράφηκε')
    if (remaining.length === 0 && onChecklistHidden) onChecklistHidden()
  }

  const handlePrint = () => {
    if (!checklist) return
    const win = window.open('', '_blank')
    if (!win) return
    const appItems = (checklist.items || []).filter(i => i.is_applicable)
    const groups = {}
    appItems.forEach(item => {
      const g = item.group_name || item.group_code || 'Λοιπά'
      if (!groups[g]) groups[g] = []
      groups[g].push(item)
    })
    win.document.write(`
      <html><head><title>${checklist.title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        h1 { color: #1e3a5f; font-size: 18px; }
        h2 { color: #1e3a5f; font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-top: 18px; }
        .item { margin: 6px 0; padding: 6px 8px; border: 1px solid #eee; border-radius: 4px; display: flex; align-items: flex-start; gap: 8px; }
        .check { width: 14px; height: 14px; border: 2px solid #aaa; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
        .check.done { background: #22c55e; border-color: #22c55e; }
        .badge { font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 8px; white-space: nowrap; }
        .ΥΠΟΧΡΕΩΤΙΚΟ { background: #fee2e2; color: #b91c1c; }
        .ΥΠΟ_ΠΡΟΫΠΟΘΕΣΗ { background: #fed7aa; color: #c2410c; }
        .ΓΙΑ_ΒΑΘΜΟΛΟΓΗΣΗ { background: #dbeafe; color: #1d4ed8; }
        .ΕΝΑΛΛΑΚΤΙΚΑ { background: #fef9c3; color: #854d0e; }
        .ΠΡΟΑΙΡΕΤΙΚΟ { background: #f3f4f6; color: #374151; }
        .client { font-size: 12px; color: #555; }
        @media print { body { margin: 10mm; } }
      </style></head><body>
      <h1>${checklist.title}</h1>
      <p class="client">Πελάτης: <strong>${caseData?.client_name || ''}</strong> &nbsp;|&nbsp; ΑΦΜ: ${caseData?.afm || ''}</p>
      <p style="font-size:10px;color:#aaa;">Εκτυπώθηκε: ${new Date().toLocaleDateString('el-GR')}</p>
    `)
    Object.entries(groups).forEach(([grp, items]) => {
      win.document.write(`<h2>${grp}</h2>`)
      items.forEach(item => {
        win.document.write(`
          <div class="item">
            <div class="check ${item.is_received ? 'done' : ''}"></div>
            <div>
              <span style="font-size:9px;color:#aaa;">${item.item_code || ''}</span>
              <span class="badge ${item.requirement_type}" style="margin-left:4px;">${REQ_LABELS[item.requirement_type] || item.requirement_type}</span>
              <strong style="font-size:12px;margin-left:6px;">${item.title}</strong>
              ${item.condition_notes ? `<div style="font-size:10px;color:#c2410c;margin-top:2px;">▸ ${item.condition_notes}</div>` : ''}
            </div>
          </div>
        `)
      })
    })
    win.document.write('</body></html>')
    win.document.close()
    win.print()
  }

  // Group items by group_name
  const grouped = useMemo(() => {
    if (!checklist) return {}
    const g = {}
    ;(checklist.items || []).forEach(item => {
      const key = item.group_name || item.group_code || 'Λοιπά'
      if (!g[key]) g[key] = []
      g[key].push(item)
    })
    return g
  }, [checklist])

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">Φόρτωση…</div>

  if (checklists.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400">
        <p className="text-sm">Δεν έχει ανατεθεί λίστα δικαιολογητικών σε αυτή την υπόθεση.</p>
        <p className="text-xs mt-1">Πηγαίνετε στη Βιβλιοθήκη Δικαιολογητικών και επιλέξτε «Ανάθεση σε Υπόθεση».</p>
      </div>
    )
  }

  const stats = checklist
    ? {
        total: (checklist.items || []).filter(i => i.is_applicable).length,
        received: (checklist.items || []).filter(i => i.is_applicable && i.is_received).length,
      }
    : { total: 0, received: 0 }

  return (
    <div className="p-5 space-y-4">
      {/* Multiple checklists selector */}
      {checklists.length > 1 && (
        <div className="flex gap-2">
          {checklists.map(c => (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                activeId === c.id ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}>
              {c.title}
            </button>
          ))}
        </div>
      )}

      {checklist && (
        <>
          {/* Checklist header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-[#1e3a5f]">{checklist.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {stats.received}/{stats.total} παραλήφθηκαν
                {stats.total > 0 && (
                  <span className="ml-2 text-gray-400">
                    ({Math.round((stats.received / stats.total) * 100)}%)
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                <PrinterIcon className="w-4 h-4" /> Εκτύπωση
              </button>
              <button onClick={handleHide}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-orange-50 hover:border-orange-200 text-gray-500 hover:text-orange-600 transition-colors">
                <EyeSlashIcon className="w-4 h-4" /> Απόκρυψη
              </button>
              {isAdmin && (
                <button onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 transition-colors">
                  <TrashIcon className="w-4 h-4" /> Διαγραφή
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {stats.total > 0 && (
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-2 bg-green-400 rounded-full transition-all"
                style={{ width: `${(stats.received / stats.total) * 100}%` }}
              />
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full border-2 border-gray-300 inline-block" /> Εκκρεμεί
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-green-500 inline-block" /> Παρελήφθη
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs border border-orange-300 bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded-full">OFF</span> Δεν εφαρμόζεται
            </span>
          </div>

          {/* Items grouped */}
          <div className="space-y-5">
            {Object.entries(grouped).map(([groupName, items]) => (
              <div key={groupName}>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="flex-1 border-t border-gray-200" />
                  {groupName}
                  <span className="bg-gray-100 text-gray-400 text-xs px-1.5 py-0.5 rounded-full">
                    {items.filter(i => i.is_applicable).length}
                  </span>
                  <span className="flex-1 border-t border-gray-200" />
                </h4>
                <div className="space-y-1.5">
                  {items.map(item => (
                    <ChecklistItem
                      key={item.id}
                      item={item}
                      checklistId={checklist.id}
                      caseId={caseId}
                      onUpdated={handleItemUpdated}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
