// Mock Viber implementation - replace with real Viber Business Messages API

interface ViberMessage {
  to: string
  text: string
  senderName?: string
}

export async function sendViberMessage(message: ViberMessage): Promise<boolean> {
  // Mock: log and return success
  console.log('[VIBER MOCK] Sending message to:', message.to)
  console.log('[VIBER MOCK] Text:', message.text.substring(0, 100))

  if (process.env.VIBER_API_TOKEN) {
    try {
      // Real implementation would go here:
      // const response = await fetch('https://chatapi.viber.com/pa/send_message', {
      //   method: 'POST',
      //   headers: { 'X-Viber-Auth-Token': process.env.VIBER_API_TOKEN, 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ receiver: message.to, min_api_version: 1, sender: { name: message.senderName || 'I-MENTOR' }, type: 'text', text: message.text })
      // })
      // const data = await response.json()
      // return data.status === 0
      return true
    } catch (error) {
      console.error('Viber send error:', error)
      return false
    }
  }

  return true // Mock success
}
