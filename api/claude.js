// api/claude.js — Vercel serverless function — proxies Anthropic API
// Uses non-streaming response (Vercel serverless doesn't support true streaming)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { ANTHROPIC_API_KEY } = process.env
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables' })
  }

  try {
    const { messages, system } = req.body
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' })
    }

    // Non-streaming call — works reliably on Vercel serverless
    const body = {
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      stream: false,
      messages,
      ...(system ? { system } : {})
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}))
      return res.status(upstream.status).json({
        error: err.error?.message || 'Anthropic API error: ' + upstream.status
      })
    }

    const data = await upstream.json()
    const text = data.content
      ? data.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : ''

    // Return as a fake SSE stream so the frontend code works unchanged
    // We send it all at once as a single data event
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')

    const fakeEvent = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: text }
    })

    res.status(200).send('data: ' + fakeEvent + '\n\n')

  } catch (err) {
    console.error('Claude proxy error:', err)
    return res.status(500).json({ error: err.message })
  }
}
