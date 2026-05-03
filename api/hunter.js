// api/hunter.js — Vercel serverless function for Hunter.io
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { HUNTER_API_KEY } = process.env
  if (!HUNTER_API_KEY) return res.status(500).json({ error: 'HUNTER_API_KEY not configured' })

  const base = 'https://api.hunter.io/v2'
  const { action, domain, email, offset, limit, firstName, lastName, company } = req.query

  try {
    // ── Account stats ─────────────────────────────────────────────────────────
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

    // ── Domain search ─────────────────────────────────────────────────────────
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

    // ── Email finder (name + company domain) ──────────────────────────────────
    if (action === 'email-finder') {
      if (!firstName || !lastName || !domain) {
        return res.status(400).json({ error: 'firstName, lastName and domain are required' })
      }
      const url = `${base}/email-finder?first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}`
      const r = await fetch(url)
      const data = await r.json()
      if (data.errors) return res.status(400).json({ error: data.errors[0]?.details || 'Email finder error' })
      const d = data.data
      return res.status(200).json({
        email: d?.email || null,
        score: d?.score || 0,
        firstName: d?.first_name || firstName,
        lastName: d?.last_name || lastName,
        position: d?.position || null,
        company: company || domain,
        domain,
        sources: d?.sources?.length || 0
      })
    }

    // ── Batch domain search (multiple domains) ─────────────────────────────────
    if (action === 'batch-domain-search' && req.method === 'POST') {
      const { domains } = req.body || {}
      if (!domains || !Array.isArray(domains)) return res.status(400).json({ error: 'domains array required' })
      const results = []
      for (const dom of domains.slice(0, 10)) { // max 10 domains per batch
        try {
          const r = await fetch(`${base}/domain-search?domain=${dom}&api_key=${HUNTER_API_KEY}&limit=5`)
          const data = await r.json()
          const emails = (data.data?.emails || []).map(e => ({
            name: [e.first_name, e.last_name].filter(Boolean).join(' '),
            email: e.value,
            confidence: e.confidence,
            role: e.position || null,
            company: data.data?.organization || dom,
            domain: dom
          }))
          if (emails.length > 0) results.push(...emails)
        } catch (e) { /* skip failed domains */ }
      }
      return res.status(200).json({ emails: results, domainsSearched: domains.length })
    }

    // ── All saved leads ───────────────────────────────────────────────────────
    if (action === 'leads') {
      const lim = limit || 100
      const off = offset || 0
      const r = await fetch(`${base}/leads?api_key=${HUNTER_API_KEY}&limit=${lim}&offset=${off}`)
      const data = await r.json()
      if (data.errors) return res.status(400).json({ error: data.errors[0]?.details || 'Failed to fetch leads' })
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

    // ── Verify email ──────────────────────────────────────────────────────────
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
