'use client'

import { Member } from '@/app/room/[id]/page'

interface Props {
  members: Member[]
  controller: Member | null
  myUserId: string
}

export default function MemberList({ members, controller, myUserId }: Props) {
  return (
    <div className="p-3 space-y-1 overflow-y-auto h-full">
      <p className="text-purple-500 text-xs mb-3">{members.length} {members.length === 1 ? 'μέλος' : 'μέλη'} online</p>
      {members.map(member => {
        const isMe = member.userId === myUserId
        const isCtrl = member.userId === controller?.userId
        return (
          <div
            key={member.userId}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              isCtrl ? 'bg-brand-600/20 border border-brand-600/30' : 'hover:bg-white/5'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className={`text-sm flex-1 truncate ${isMe ? 'text-white font-medium' : 'text-purple-200'}`}>
              {member.username}
              {isMe && <span className="text-purple-400 font-normal ml-1">(εσύ)</span>}
            </span>
            {isCtrl && (
              <span className="text-xs bg-brand-600/50 text-brand-300 px-1.5 py-0.5 rounded shrink-0">
                🎮 ctrl
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
