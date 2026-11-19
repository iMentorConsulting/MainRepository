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

  // Always-fresh refs so onReady/callbacks never have stale closures
  const videoRef = useRef(video)
  const videoReceivedAtRef = useRef(Date.now())

  const [urlInput, setUrlInput] = useState('')
  const [addMode, setAddMode] = useState<'play' | 'queue'>('play')
  const [urlError, setUrlError] = useState('')

  // iOS detection (client-side only)
  const [isIOS, setIsIOS] = useState(false)
  // Whether iOS viewer has already tapped to start the current video
  const [hasTapped, setHasTapped] = useState(false)

  useEffect(() => {
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(ios)
  }, [])

  useEffect(() => {
    videoRef.current = video
    videoReceivedAtRef.current = Date.now()
    setHasTapped(false) // reset tap state for each new video
  }, [video])

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

  // onReady: uses refs to always have fresh state + accounts for elapsed time
  const onReady = useCallback((e: YouTubeEvent) => {
    playerRef.current = e.target
    const v = videoRef.current
    const elapsed = v.isPlaying ? (Date.now() - videoReceivedAtRef.current) / 1000 : 0
    const seekTo = v.currentTime + elapsed
    if (seekTo > 0) e.target.seekTo(seekTo, true)
    if (v.isPlaying) {
      e.target.playVideo() // silently fails on iOS without gesture — tap overlay handles it
    } else {
      e.target.pauseVideo()
    }
  }, [])

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

  // Show tap overlay on iOS when video is playing and viewer hasn't tapped yet
  const showTapOverlay = !isController && !!video.videoId && isIOS && video.isPlaying && !hasTapped

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
                playsinline: 1,       // required for iOS inline playback
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

        {/* iOS: tap overlay to satisfy user-gesture requirement */}
        {showTapOverlay && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 cursor-pointer"
            onClick={() => {
              const player = playerRef.current
              if (player) {
                const v = videoRef.current
                const elapsed = (Date.now() - videoReceivedAtRef.current) / 1000
                player.seekTo(v.currentTime + elapsed, true)
                player.playVideo()
              }
              setHasTapped(true)
            }}
          >
            <div className="text-center select-none">
              <div className="text-6xl mb-3">▶</div>
              <p className="text-white text-base font-semibold">Πάτα για σύγχρονο</p>
            </div>
          </div>
        )}

        {/* Non-iOS viewer: block all interaction */}
        {!isController && video.videoId && !showTapOverlay && (
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
