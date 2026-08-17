'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'

export function VideoUrlsInput({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')

  function add() {
    const v = input.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setInput('')
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">Βίντεο YouTube (Παρουσίαση Προγράμματος)</label>
      <p className="text-xs text-gray-500">Προσθέστε ένα ή περισσότερα links από YouTube (π.χ. YouTube Shorts) όπου εξηγείτε το πρόγραμμα.</p>
      {values.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {values.map((v, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <span className="flex-1 truncate text-gray-700">{v}</span>
              <button type="button" onClick={() => onChange(values.filter((_, idx) => idx !== i))}>
                <X size={14} className="text-gray-400 hover:text-gray-600" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="https://www.youtube.com/shorts/..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus size={14} />
        </Button>
      </div>
    </div>
  )
}

// Extracts a YouTube video ID from common URL formats (watch, shorts, youtu.be, embed).
export function getYoutubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}
