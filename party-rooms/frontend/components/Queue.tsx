'use client'

import { useState } from 'react'
import Image from 'next/image'
import { QueueItem } from '@/app/room/[id]/page'

interface Props {
  queue: QueueItem[]
  isController: boolean
  myUserId: string
  onRemove: (itemId: string) => void
  onAddToQueue: (videoId: string, title: string, thumbnail?: string) => void
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

export default function Queue({ queue, isController, myUserId, onRemove, onAddToQueue }: Props) {
  const [urlInput, setUrlInput] = useState('')
  const [error, setError] = useState('')

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const videoId = extractVideoId(urlInput.trim())
    if (!videoId) { setError('Μη έγκυρο YouTube URL ή ID'); return }
    const title = `Video (${videoId})`
    const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    onAddToQueue(videoId, title, thumbnail)
    setUrlInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Add to queue */}
      <div className="p-3 border-b border-purple-800/50">
        <p className="text-xs text-purple-400 mb-2">Πρόσθεσε βίντεο στην ουρά</p>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            className="input text-xs py-1.5 flex-1"
            placeholder="YouTube URL ή ID..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
          />
          <button type="submit" className="btn-primary text-xs py-1.5 px-2.5" disabled={!urlInput.trim()}>
            +
          </button>
        </form>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {queue.length === 0 ? (
          <p className="text-purple-500 text-xs text-center mt-4">Η ουρά είναι άδεια</p>
        ) : (
          queue.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
              <span className="text-purple-500 text-xs w-4 text-center shrink-0">{index + 1}</span>
              {item.thumbnail && (
                <div className="relative w-10 h-7 shrink-0 rounded overflow-hidden">
                  <Image
                    src={item.thumbnail}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{item.title}</p>
                <p className="text-xs text-purple-500">από {item.addedByUsername}</p>
              </div>
              {(isController || item.addedBy === myUserId) && (
                <button
                  onClick={() => onRemove(item.id)}
                  className="text-purple-500 hover:text-red-400 transition-colors text-sm shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
