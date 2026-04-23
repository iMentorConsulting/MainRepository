'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import YouTube, { YouTubePlayer as YTPlayer, YouTubeEvent } from 'react-youtube'
import { VideoState } from '@/app/room/[id]/page'

interface Props {
  video: VideoState
  isController: boolean
  onVideoEvent: (event: 'play' | 'pause' | 'seek' | 'ended', currentTime: number) => void
  onAddToQueue: (videoId: string, title: string, thumbnail?: string) => void
  onVideoChange: (videoId: string, title: string, thumbnail?: string) => void
}

function extractVideoId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match) return match[1]
  }
  return null
}

export default function YouTubePlayer({ video, isController, onVideoEvent, onAddToQueue, onVideoChange }: Props) {
  const playerRef = useRef<YTPlayer | null>(null)
  const isSyncingRef = useRef(false)
  const lastSeekRef = useRef(0)
  const prevVideoIdRef = useRef<string | null>(null)

  const [urlInput, setUrlInput] = useState('')
  const [addMode, setAddMode] = useState<'play' | 'queue'>('play')
  const [urlError, setUrlError] = useState('')

  // Sync play/pause/seek — skip when videoId changed (key prop handles remount)
  useEffect(() => {
    if (video.videoId !== prevVideoIdRef.current) {
      prevVideoIdRef.current = video.videoId
      return
    }
    const player = playerRef.current
    if (!player) return

    isSyncingRef.current = true
    const state = player.getPlayerState?.()

    if (video.isPlaying) {
      const diff = Math.abs((player.getCurrentTime?.() || 0) - video.currentTime)
      if (diff > 1.5) player.seekTo?.(video.currentTime, true)
      if (state !== 1) player.playVideo?.()
    } else {
      if (state === 1) player.pauseVideo?.()
      const diff = Math.abs((player.getCurrentTime?.() || 0) - video.currentTime)
      if (diff > 0.5) player.seekTo?.(video.currentTime, true)
    }

    setTimeout(() => { isSyncingRef.current = false }, 300)
  }, [video])

  const onReady = useCallback((e: YouTubeEvent) => {
    playerRef.current = e.target
    if (video.currentTime > 0) e.target.seekTo(video.currentTime, true)
    if (!video.isPlaying) e.target.pauseVideo()
  }, [video.currentTime, video.isPlaying])

  const onStateChange = useCallback((e: YouTubeEvent) => {
    const state = e.data

    // Everyone fires ended so queue advances even if controller disconnects
    if (state === 0) {
      onVideoEvent('ended', 0)
      return
    }

    // Only controller fires play/pause
    if (isSyncingRef.current || !isController) return
    const player = e.target
    if (state === 1) onVideoEvent('play', player.getCurrentTime())
    else if (state === 2) onVideoEvent('pause', player.getCurrentTime())
  }, [isController, onVideoEvent])

  const onSeek = useCallback(() => {
    if (!isController || !playerRef.current) return
    const now = Date.now()
    if (now - lastSeekRef.current < 500) return
    lastSeekRef.current = now
    onVideoEvent('seek', playerRef.current.getCurrentTime())
  }, [isController, onVideoEvent])

  function handleAddVideo(e: React.FormEvent) {
    e.preventDefault()
    setUrlError('')
    const videoId = extractVideoId(urlInput.trim())
    if (!videoId) { setUrlError('Μη έγκυρο YouTube URL ή ID'); return }

    const title = `YouTube Video (${videoId})`
    const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`

    if (addMode === 'play') {
      onVideoChange(videoId, title, thumbnail)
    } else {
      onAddToQueue(videoId, title, thumbnail)
    }
    setUrlInput('')
  }

  return (
    <div className="w-full h-full flex flex-col bg-black">
      {/* Player */}
      <div className="flex-1 relative">
        {video.videoId ? (
          <YouTube
            key={video.videoId}
            videoId={video.videoId}
            onReady={onReady}
            onStateChange={onStateChange}
            onPlaybackRateChange={onSeek}
            className="w-full h-full"
            iframeClassName="w-full h-full"
            opts={{
              width: '100%',
              height: '100%',
              playerVars: {
                autoplay: 1,
                controls: isController ? 1 : 0,
                disablekb: isController ? 0 : 1,
                modestbranding: 1,
                rel: 0
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
            <div className="text-3xl md:text-5xl mb-2 md:mb-4">🎵</div>
            <p className="text-purple-300 text-sm md:text-lg font-medium">Δεν παίζει τίποτα</p>
            <p className="text-purple-500 text-xs md:text-sm mt-1">
              {isController ? 'Πρόσθεσε YouTube video στην Queue' : 'Περίμενε τον controller'}
            </p>
          </div>
        )}

        {/* Viewer overlay to prevent interaction */}
        {!isController && video.videoId && (
          <div className="absolute inset-0 z-10 cursor-not-allowed" />
        )}
      </div>

      {/* Controller input — hidden on mobile (shown in sidebar Queue tab instead) */}
      {isController && (
        <div className="hidden md:block bg-[#0f0a1a] border-t border-purple-900/50 p-3">
          <form onSubmit={handleAddVideo} className="flex gap-2">
            <input
              className="input text-sm py-1.5 flex-1"
              placeholder="YouTube URL ή Video ID..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
            />
            <select
              value={addMode}
              onChange={e => setAddMode(e.target.value as 'play' | 'queue')}
              className="bg-white/5 border border-purple-800/50 text-purple-300 rounded-lg px-2 text-sm focus:outline-none"
            >
              <option value="play">▶ Τώρα</option>
              <option value="queue">+ Queue</option>
            </select>
            <button type="submit" className="btn-primary text-sm py-1.5 px-3" disabled={!urlInput.trim()}>
              Εντάξει
            </button>
          </form>
          {urlError && <p className="text-red-400 text-xs mt-1">{urlError}</p>}
        </div>
      )}
    </div>
  )
}
