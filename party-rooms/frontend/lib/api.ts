const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

function headers() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

export async function login(username: string) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  })
  return res.json()
}

export async function getRooms() {
  const res = await fetch(`${API}/api/rooms`, { headers: headers() })
  return res.json()
}

export async function getRoom(id: string) {
  const res = await fetch(`${API}/api/rooms/${id}`, { headers: headers() })
  return res.json()
}

export async function getRoomByCode(code: string) {
  const res = await fetch(`${API}/api/rooms/join/${code}`, { headers: headers() })
  return res.json()
}

export async function createRoom(name: string, isPublic: boolean) {
  const res = await fetch(`${API}/api/rooms`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, isPublic })
  })
  return res.json()
}

export async function searchYouTube(q: string): Promise<{ videoId: string; title: string; thumbnail?: string; channel: string }[]> {
  const res = await fetch(`${API}/api/youtube/search?q=${encodeURIComponent(q)}`, { headers: headers() })
  if (!res.ok) return []
  return res.json()
}
