import { Router } from 'express'
import { requireAuth } from '../middleware/auth'

const router = Router()

interface YTSearchItem {
  id: { videoId: string }
  snippet: {
    title: string
    channelTitle: string
    thumbnails: {
      medium?: { url: string }
      default?: { url: string }
    }
  }
}

router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q as string)?.trim()
  if (!q) { res.json([]); return }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) { res.status(503).json({ error: 'YouTube API not configured' }); return }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(q)}&key=${apiKey}`
    const response = await fetch(url)
    const data = await response.json() as { items?: YTSearchItem[]; error?: { message: string } }

    if (data.error) { res.status(400).json({ error: data.error.message }); return }
    if (!data.items) { res.json([]); return }

    res.json(data.items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      channel: item.snippet.channelTitle
    })))
  } catch {
    res.status(500).json({ error: 'Search failed' })
  }
})

export default router
