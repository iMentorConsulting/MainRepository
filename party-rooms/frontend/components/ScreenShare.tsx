'use client'

import { useEffect, useRef, useCallback } from 'react'
import Peer from 'simple-peer'
import { getSocket } from '@/lib/socket'
import { Member } from '@/app/room/[id]/page'

interface Props {
  roomId: string
  isSharer: boolean
  sharerId: string
  members: Member[]
  me: { userId: string; username: string } | null
}

export default function ScreenShare({ roomId, isSharer, sharerId, members, me }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const peersRef = useRef<Map<string, InstanceType<typeof Peer>>>(new Map())
  const streamRef = useRef<MediaStream | null>(null)

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    peersRef.current.forEach(p => p.destroy())
    peersRef.current.clear()
    getSocket().emit('screen:stop', { roomId })
  }, [roomId])

  useEffect(() => {
    const socket = getSocket()

    if (isSharer) {
      // Start capturing screen
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        .then(stream => {
          streamRef.current = stream

          if (videoRef.current) {
            videoRef.current.srcObject = stream
            videoRef.current.play().catch(() => {})
          }

          // When a viewer is ready, send them an offer
          socket.on('screen:signal', ({ from, signal }: { from: string; signal: Peer.SignalData }) => {
            if (!peersRef.current.has(from)) {
              const peer = new Peer({ initiator: false, trickle: false, stream })
              peer.on('signal', data => {
                socket.emit('screen:signal', { roomId, to: from, signal: data })
              })
              peer.signal(signal)
              peersRef.current.set(from, peer)
            }
          })

          // Stop if track ends (user hits browser stop button)
          stream.getVideoTracks()[0]?.addEventListener('ended', stopSharing)
        })
        .catch(() => {
          getSocket().emit('screen:stop', { roomId })
        })
    } else {
      // Viewer: create peer and send offer to sharer
      const peer = new Peer({ initiator: true, trickle: false })

      peer.on('signal', data => {
        socket.emit('screen:signal', { roomId, to: sharerId, signal: data })
      })

      peer.on('stream', stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })

      socket.on('screen:signal', ({ from, signal }: { from: string; signal: Peer.SignalData }) => {
        if (from === sharerId) peer.signal(signal)
      })

      peersRef.current.set(sharerId, peer)
    }

    return () => {
      socket.off('screen:signal')
      if (isSharer) stopSharing()
      else {
        peersRef.current.forEach(p => p.destroy())
        peersRef.current.clear()
      }
    }
  }, [isSharer, sharerId, roomId, stopSharing])

  const sharerUsername = members.find(m => m.userId === sharerId)?.username || 'κάποιος'

  return (
    <div className="w-full h-full relative bg-black flex flex-col">
      <video ref={videoRef} className="w-full h-full object-contain" muted={isSharer} />

      {!isSharer && (
        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
          📺 Οθόνη του {sharerUsername}
        </div>
      )}

      {isSharer && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={stopSharing}
            className="bg-red-600 hover:bg-red-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            ⏹ Σταμάτα κοινοποίηση
          </button>
        </div>
      )}
    </div>
  )
}
