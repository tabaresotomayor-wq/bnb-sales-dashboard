// Vercel serverless function — GET /api/velocity
// Returns MTD + 7-day lead intake and "Won / Buyer" counts.

async function searchCount(token, filters) {
  const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ filterGroups: [{ filters }], limit: 1 })
  });
  if (!r.ok) return { count: 0, error: r.status };
  const d = await r.json();
  return { count: d.total || 0 };
}

export default async function handler(req, res) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: "HUBSPOT_TOKEN env var not set" });
    return;
  }

  try {
    const now = new Date();
    const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [leadsMTD, leads7d, wonMTD, won7d] = await Promise.all([
      searchCount(token, [
        { propertyName: "createdate", operator: "GTE", value: mtdStart }
      ]),
      searchCount(token, [
        { propertyName: "createdate", operator: "GTE", value: sevenAgo }
      ]),
      searchCount(token, [
        { propertyName: "hs_lead_status", operator: "EQ", value: "Won / Buyer" },
        { propertyName: "hs_lastmodifieddate", operator: "GTE", value: mtdStart }
      ]),
      searchCount(token, [
        { propertyName: "hs_lead_status", operator: "EQ", value: "Won / Buyer" },
        { propertyName: "hs_lastmodifieddate", operator: "GTE", value: sevenAgo }
      ])
    ]);

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).json({
      leadsMTD: leadsMTD.count,
      leads7d:  leads7d.count,
      wonMTD:   wonMTD.count,
      won7d:    won7d.count,
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
