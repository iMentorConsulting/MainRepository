'use client'
import { useState } from 'react'
import { X, PlayCircle } from 'lucide-react'

export interface VideoThumbnail {
  title: string
  videoId: string
}

// Small, easy-to-miss YouTube thumbnails (e.g. onboarding/explainer videos
// on the exodikastikos/ptoxeusi pages) that enlarge into a real player on
// click instead of staying tiny and hard to actually watch.
export function VideoThumbnailGrid({ videos, heading }: { videos: VideoThumbnail[]; heading?: string }) {
  const [openVideoId, setOpenVideoId] = useState<string | null>(null)
  const openVideo = videos.find(v => v.videoId === openVideoId)

  return (
    <div>
      {heading && (
        <h3 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
          <PlayCircle size={15} className="text-indigo-500" />
          {heading}
        </h3>
      )}
      <div className="flex flex-wrap gap-3">
        {videos.map((v, i) => (
          <button
            key={i}
            type="button"
            onClick={() => v.videoId && setOpenVideoId(v.videoId)}
            className="w-36 shrink-0 text-left group"
          >
            <div className="aspect-[9/16] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden relative">
              {v.videoId ? (
                <>
                  <img
                    src={`https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`}
                    alt={v.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                    <PlayCircle size={36} className="text-white drop-shadow" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center"><PlayCircle size={24} className="text-gray-300" /></div>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5 text-center leading-tight">{v.title}</p>
          </button>
        ))}
      </div>

      {openVideo && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setOpenVideoId(null)}
        >
          <div className="relative w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setOpenVideoId(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
            >
              <X size={28} />
            </button>
            <div className="aspect-video rounded-xl overflow-hidden bg-black">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${openVideo.videoId}?autoplay=1`}
                title={openVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="text-white text-sm text-center mt-3">{openVideo.title}</p>
          </div>
        </div>
      )}
    </div>
  )
}
