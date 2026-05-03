// api/hunter.js — Vercel serverless function for Hunter.io
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { HUNTER_API_KEY } = process.env
  if (!HUNTER_API_KEY) return res.status(500).json({ error: 'HUNTER_API_KEY not configured' })

  const base = 'https://api.hunter.io/v2'
  const { action, domain, email, offset, limit } = req.query

  try {
    // ── GET account stats ─────────────────────────────────────────────────────
    if (action === 'account' || !action) {
      const r = await fetch(`${base}/account?api_key=${HUNTER_API_KEY}`)
      const data = await r.json()
      const acc = data.data
      return res.status(200).json({
        creditsUsed: acc.requests.searches.used,
        creditsTotal: acc.requests.searches.available,
        verificationUsed: acc.requests.verifications.used,
        verificationTotal: acc.requests.verifications.available,
        plan: acc.plan_name,
        email: acc.email
      })
    }

    // ── GET all saved leads ───────────────────────────────────────────────────
    if (action === 'leads') {
      const lim = limit || 100
      const off = offset || 0
      const r = await fetch(`${base}/leads?api_key=${HUNTER_API_KEY}&limit=${lim}&offset=${off}`)
      const data = await r.json()

      if (data.errors) {
        return res.status(400).json({ error: data.errors[0]?.details || 'Failed to fetch leads' })
      }

      const leads = (data.data?.leads || []).map(l => ({
        id: l.id,
        name: [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
        firstName: l.first_name || '',
        lastName: l.last_name || '',
        email: l.email || '',
        company: l.company || '',
        position: l.position || '',
        phone: l.phone_number || '',
        linkedinUrl: l.linkedin_url || '',
        source: l.source || '',
        confidence: l.confidence || null,
        sendingStatus: l.sending_status || '',
        createdAt: l.leads_list?.id ? l.leads_list.name : ''
      }))

      return res.status(200).json({
        leads,
        total: data.data?.meta?.total || leads.length,
        offset: parseInt(off),
        limit: parseInt(lim)
      })
    }

    // ── GET leads lists ───────────────────────────────────────────────────────
    if (action === 'leads-lists') {
      const r = await fetch(`${base}/leads_lists?api_key=${HUNTER_API_KEY}`)
      const data = await r.json()
      const lists = (data.data?.leads_lists || []).map(l => ({
        id: l.id,
        name: l.name,
        leadCount: l.leads_count
      }))
      return res.status(200).json({ lists })
    }

    // ── GET domain search ─────────────────────────────────────────────────────
    if (action === 'domain-search' && domain) {
      const r = await fetch(`${base}/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=10`)
      const data = await r.json()
      const emails = (data.data?.emails || []).map(e => ({
        name: [e.first_name, e.last_name].filter(Boolean).join(' '),
        email: e.value,
        confidence: e.confidence,
        role: e.position || null,
        department: e.department || null
      }))
      return res.status(200).json({ domain, emails, total: data.data?.meta?.total || 0 })
    }

    // ── GET verify single email ───────────────────────────────────────────────
    if (action === 'verify' && email) {
      const r = await fetch(`${base}/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`)
      const data = await r.json()
      return res.status(200).json({
        email,
        status: data.data?.status,
        score: data.data?.score,
        result: data.data?.result
      })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error('Hunter error:', err)
    return res.status(500).json({ error: err.message })
  }
}
