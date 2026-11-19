'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { QueueItem } from '@/app/room/[id]/page'
import { searchYouTube } from '@/lib/api'

interface SearchResult {
  videoId: string
  title: string
  thumbnail?: string
  channel: string
}

interface Props {
  queue: QueueItem[]
  isController: boolean
  myUserId: string
  onRemove: (itemId: string) => void
  onAddToQueue: (videoId: string, title: string, thumbnail?: string) => void
  onVideoChange: (videoId: string, title: string, thumbnail?: string) => void
}

function extractVideoId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const p of patterns) {
    const m = input.match(p)
    if (m) return m[1]
  }
  return null
}

function decodeHtml(text: string): string {
  if (typeof document === 'undefined') return text
  const el = document.createElement('textarea')
  el.innerHTML = text
  return el.value
}

export default function Queue({ queue, isController, myUserId, onRemove, onAddToQueue, onVideoChange }: Props) {
  const [mode, setMode] = useState<'url' | 'search'>('search')
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value)
    setSearchError('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await searchYouTube(value.trim())
        setResults(data)
        if (data.length === 0) setSearchError('Δεν βρέθηκαν αποτελέσματα')
      } catch {
        setSearchError('Σφάλμα αναζήτησης')
      } finally {
        setSearching(false)
      }
    }, 500)
  }, [])

  function handleUrlAdd(e: React.FormEvent) {
    e.preventDefault()
    setUrlError('')
    const videoId = extractVideoId(urlInput.trim())
    if (!videoId) { setUrlError('Μη έγκυρο YouTube URL ή ID'); return }
    const title = `Video (${videoId})`
    const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    onAddToQueue(videoId, title, thumbnail)
    setUrlInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle */}
      <div className="flex border-b border-purple-800/50 shrink-0">
        <button
          onClick={() => setMode('search')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${mode === 'search' ? 'text-brand-400 border-b-2 border-brand-500' : 'text-purple-400 hover:text-purple-200'}`}
        >
          🔍 Αναζήτηση
        </button>
        <button
          onClick={() => setMode('url')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${mode === 'url' ? 'text-brand-400 border-b-2 border-brand-500' : 'text-purple-400 hover:text-purple-200'}`}
        >
          🔗 URL / ID
        </button>
      </div>

      {/* Input area */}
      <div className="p-3 border-b border-purple-800/50 shrink-0">
        {mode === 'search' ? (
          <div>
            <input
              className="input text-xs py-1.5 w-full"
              placeholder="Αναζήτηση στο YouTube..."
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
            />
            {searching && <p className="text-purple-400 text-xs mt-1">Αναζήτηση...</p>}
            {searchError && !searching && <p className="text-purple-500 text-xs mt-1">{searchError}</p>}
          </div>
        ) : (
          <form onSubmit={handleUrlAdd} className="flex gap-2">
            <input
              className="input text-xs py-1.5 flex-1"
              placeholder="YouTube URL ή Video ID..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
            />
            <button type="submit" className="btn-primary text-xs py-1.5 px-2.5" disabled={!urlInput.trim()}>
              +
            </button>
          </form>
        )}
        {urlError && <p className="text-red-400 text-xs mt-1">{urlError}</p>}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Search results */}
        {mode === 'search' && results.length > 0 && (
          <div className="p-2 space-y-1 border-b border-purple-800/30">
            <p className="text-purple-500 text-xs px-1 pb-1">Αποτελέσματα</p>
            {results.map(item => (
              <div key={item.videoId} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                {item.thumbnail && (
                  <div className="relative w-14 h-10 shrink-0 rounded overflow-hidden">
                    <Image src={item.thumbnail} alt={item.title} fill className="object-cover" sizes="56px" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{decodeHtml(item.title)}</p>
                  <p className="text-xs text-purple-500 truncate">{item.channel}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {isController && (
                    <button
                      onClick={() => onVideoChange(item.videoId, decodeHtml(item.title), item.thumbnail)}
                      className="text-xs bg-brand-600/80 hover:bg-brand-500 text-white px-2 py-0.5 rounded transition-colors"
                      title="Παίξε τώρα"
                    >
                      ▶
                    </button>
                  )}
                  <button
                    onClick={() => onAddToQueue(item.videoId, decodeHtml(item.title), item.thumbnail)}
                    className="text-xs bg-purple-700/60 hover:bg-purple-600 text-white px-2 py-0.5 rounded transition-colors"
                    title="Προσθήκη στην ουρά"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Queue list */}
        <div className="p-3 space-y-2">
          {queue.length === 0 ? (
            <p className="text-purple-500 text-xs text-center mt-4">Η ουρά είναι άδεια</p>
          ) : (
            <>
              <p className="text-purple-500 text-xs">Ουρά ({queue.length})</p>
              {queue.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                  <span className="text-purple-500 text-xs w-4 text-center shrink-0">{index + 1}</span>
                  {item.thumbnail && (
                    <div className="relative w-10 h-7 shrink-0 rounded overflow-hidden">
                      <Image src={item.thumbnail} alt={item.title} fill className="object-cover" sizes="40px" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{item.title}</p>
                    <p className="text-xs text-purple-500">από {item.addedByUsername}</p>
                  </div>
                  <button
                    onClick={() => onRemove(item.id)}
                    className="text-purple-500 hover:text-red-400 transition-colors text-sm shrink-0"
                    title="Αφαίρεση"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
