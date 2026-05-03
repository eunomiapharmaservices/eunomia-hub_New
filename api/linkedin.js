// api/linkedin.js — Vercel serverless function for LinkedIn
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORG_ID } = process.env

  if (!LINKEDIN_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'LINKEDIN_ACCESS_TOKEN not configured' })
  }

  const headers = {
    Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
    'LinkedIn-Version': '202501',
    'X-Restli-Protocol-Version': '2.0.0'
  }

  try {
    const { action } = req.query

    if (action === 'profile' || !action) {

      // Try OpenID userinfo endpoint first (works with openid scope)
      const userinfoRes = await fetch('https://api.linkedin.com/v2/userinfo', { headers })
      
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json()
        // OpenID userinfo returns: sub, name, given_name, family_name, email, picture
        const firstName = userinfo.given_name || ''
        const lastName = userinfo.family_name || ''
        const name = userinfo.name || [firstName, lastName].filter(Boolean).join(' ') || 'LinkedIn User'

        // Try to get connection count separately
        let connections = null
        try {
          const connRes = await fetch(
            'https://api.linkedin.com/v2/connections?q=viewer&start=0&count=0',
            { headers }
          )
          if (connRes.ok) {
            const connData = await connRes.json()
            connections = connData.paging?.total ?? null
          }
        } catch {}

        return res.status(200).json({
          name,
          firstName,
          lastName,
          email: userinfo.email || null,
          picture: userinfo.picture || null,
          connections,
          source: 'openid'
        })
      }

      // Fallback: try v2/me with projection
      const meRes = await fetch(
        'https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)',
        { headers }
      )

      if (meRes.ok) {
        const me = await meRes.json()
        const firstName = me.localizedFirstName || me.firstName?.localized?.en_US || ''
        const lastName = me.localizedLastName || me.lastName?.localized?.en_US || ''
        const name = [firstName, lastName].filter(Boolean).join(' ') || 'LinkedIn User'

        return res.status(200).json({
          name,
          firstName,
          lastName,
          connections: null,
          source: 'v2me'
        })
      }

      // Both failed — return the raw error so we can debug
      const errBody = await meRes.json().catch(() => ({}))
      return res.status(200).json({
        name: 'LinkedIn Connected',
        firstName: '',
        lastName: '',
        connections: null,
        source: 'fallback',
        debug: errBody
      })
    }

    // Org stats
    if (action === 'org-stats' && LINKEDIN_ORG_ID) {
      const since = Date.now() - 30 * 24 * 60 * 60 * 1000
      const url = `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${LINKEDIN_ORG_ID}&timeIntervals.timeGranularityType=MONTH&timeIntervals.timeRange.start=${since}&timeIntervals.timeRange.end=${Date.now()}`
      const r = await fetch(url, { headers })
      const data = await r.json()
      const stats = data.elements?.[0]?.totalShareStatistics || {}
      return res.status(200).json({
        impressions: stats.impressionCount || 0,
        clicks: stats.clickCount || 0,
        shares: stats.shareCount || 0,
        reactions: stats.likeCount || 0,
        comments: stats.commentCount || 0
      })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error('LinkedIn error:', err)
    return res.status(500).json({ error: err.message })
  }
}
