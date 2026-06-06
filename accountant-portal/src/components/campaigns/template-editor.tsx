'use client'
import { useRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface TemplateEditorProps {
  value: string
  onChange: (value: string) => void
  label?: string
  error?: string
}

const PLACEHOLDERS = [
  { key: '{{business_name}}', label: 'Επωνυμία' },
  { key: '{{afm}}', label: 'ΑΦΜ' },
  { key: '{{accountant_name}}', label: 'Λογιστής' },
  { key: '{{accountant_office}}', label: 'Γραφείο' },
  { key: '{{program_title}}', label: 'Πρόγραμμα' },
  { key: '{{kad_description}}', label: 'ΚΑΔ' },
  { key: '{{unsubscribe_link}}', label: 'Αποδοχή' },
]

export function TemplateEditor({ value, onChange, label, error }: TemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function insertPlaceholder(placeholder: string) {
    const el = textareaRef.current
    if (!el) {
      onChange(value + placeholder)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const newValue = value.slice(0, start) + placeholder + value.slice(end)
    onChange(newValue)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + placeholder.length, start + placeholder.length)
    }, 0)
  }

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200">
        <span className="text-xs text-gray-500 self-center mr-1">Εισαγωγή:</span>
        {PLACEHOLDERS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => insertPlaceholder(p.key)}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors font-mono"
          >
            {p.label}
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={10}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-vertical font-mono"
        placeholder="Γράψτε το μήνυμά σας εδώ... Χρησιμοποιήστε τα κουμπιά παραπάνω για placeholders."
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
