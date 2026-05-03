// api/salesrobot.js
// Sales Robot API — tries multiple endpoint patterns to find the right one
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { SALES_ROBOT_API_KEY } = process.env

  // If no API key, return structured mock matching the real data we can see
  if (!SALES_ROBOT_API_KEY) {
    return res.status(200).json({
      mock: true,
      summary: {
        activeSequences: 4,
        messagesSent: 586,
        replies: 86,
        replyRate: '24.1',
        meetings: 0
      },
      campaigns: [
        { name: 'List 1: Medical Directors', sent: 194, replies: 24, rate: '25.29', status: 'active' },
        { name: 'Legal', sent: 213, replies: 35, rate: '25.72', status: 'active' },
        { name: 'Compliance and Ethics', sent: 120, replies: 20, rate: '21.42', status: 'active' },
        { name: 'Pharma Leaders - Compliance, Ethics, Medical & Legal (1001-5000)', sent: 59, replies: 7, rate: '21.77', status: 'active' },
      ]
    })
  }

  // Try multiple Sales Robot API endpoint patterns
  const attempts = [
    { url: 'https://app.salesrobot.co/api/v1/campaigns', headers: { 'x-api-key': SALES_ROBOT_API_KEY } },
    { url: 'https://app.salesrobot.co/api/campaigns', headers: { 'x-api-key': SALES_ROBOT_API_KEY } },
    { url: 'https://api.salesrobot.co/v1/campaigns', headers: { 'Authorization': `Bearer ${SALES_ROBOT_API_KEY}` } },
    { url: 'https://app.salesrobot.co/api/v1/sequences', headers: { 'x-api-key': SALES_ROBOT_API_KEY } },
  ]

  let lastError = ''
  for (const attempt of attempts) {
    try {
      const r = await fetch(attempt.url, {
        headers: { 'Content-Type': 'application/json', ...attempt.headers }
      })

      if (r.ok) {
        const data = await r.json()
        // Normalise whatever structure comes back
        const raw = data.campaigns || data.sequences || data.data || data.results || []

        if (Array.isArray(raw) && raw.length > 0) {
          const campaigns = raw.map(c => ({
            name: c.name || c.title || c.campaign_name || 'Unnamed',
            sent: c.total_sent || c.messages_sent || c.contacted || c.requests_accepted || 0,
            replies: c.total_replies || c.replies_count || c.replied || 0,
            rate: c.total_sent
              ? ((( c.total_replies || c.replies_count || 0) / c.total_sent) * 100).toFixed(2)
              : (c.reply_rate || c.replyRate || '0.00'),
            status: c.status || 'active',
            id: c.id
          }))

          const totalSent = campaigns.reduce((s, c) => s + (c.sent || 0), 0)
          const totalReplies = campaigns.reduce((s, c) => s + (c.replies || 0), 0)

          return res.status(200).json({
            campaigns,
            summary: {
              activeSequences: campaigns.filter(c => c.status === 'active').length,
              messagesSent: totalSent,
              replies: totalReplies,
              replyRate: totalSent ? ((totalReplies / totalSent) * 100).toFixed(1) : '0.0',
              meetings: 0
            },
            source: attempt.url
          })
        }
      }
      lastError = `${attempt.url} returned ${r.status}`
    } catch (e) {
      lastError = e.message
    }
  }

  // All endpoints failed — return the real data we know from the screenshot
  // so the dashboard always shows useful data
  return res.status(200).json({
    mock: true,
    apiError: lastError,
    summary: {
      activeSequences: 4,
      messagesSent: 586,
      replies: 86,
      replyRate: '24.1',
      meetings: 0
    },
    campaigns: [
      { name: 'List 1: Medical Directors', sent: 194, replies: 24, rate: '25.29', status: 'active' },
      { name: 'Legal', sent: 213, replies: 35, rate: '25.72', status: 'active' },
      { name: 'Compliance and Ethics', sent: 120, replies: 20, rate: '21.42', status: 'active' },
      { name: 'Pharma Leaders - Compliance, Ethics, Medical & Legal (1001-5000)', sent: 59, replies: 7, rate: '21.77', status: 'active' },
    ]
  })
}
