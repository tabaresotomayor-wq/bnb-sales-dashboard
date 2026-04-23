// Vercel serverless function — GET /api/funnel
// Returns lead counts per hs_lead_status value, live from HubSpot.
// Sequentialized to respect HubSpot Private App rate limits (9/sec).

const STATUSES = [
  { key: "NEW",                          label: "NEW",                 stage: "NEW"     },
  { key: "ATTEMPTED_TO_CONTACT",         label: "Attempting Contact",  stage: "ATTEMPT" },
  { key: "Appointment Set",              label: "Appointment Set",     stage: "APPT"    },
  { key: "Follow up Closers",            label: "FU - Closers",        stage: "FOLLOW"  },
  { key: "Follow up for Setters",        label: "FU - Setters",        stage: "FOLLOW"  },
  { key: "Long Term - Follow Up Closers",label: "Long-Term FU",        stage: "FOLLOW"  },
  { key: "Gino Working Lead",            label: "Gino Working",        stage: "WORKING" },
  { key: "Tabare Working Lead",          label: "Tabare Working",      stage: "WORKING" },
  { key: "No Show",                      label: "No Show",             stage: "NS"      },
  { key: "Not qualified for BNB",        label: "Not Qualified",       stage: "NQ"      },
  { key: "Lost",                         label: "Lost",                stage: "LOST"    },
  { key: "Won / Buyer",                  label: "Won / Buyer",         stage: "WON"     }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function countStatus(token, value, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "hs_lead_status", operator: "EQ", value }] }],
        limit: 1
      })
    });
    if (r.ok) {
      const d = await r.json();
      return { count: d.total || 0 };
    }
    if (r.status === 429 && attempt < retries) {
      await sleep(1100); // wait out the secondly limit
      continue;
    }
    return { count: 0, error: r.status };
  }
  return { count: 0, error: "max_retries" };
}

export default async function handler(req, res) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: "HUBSPOT_TOKEN env var not set" });
    return;
  }

  try {
    // Run in batches of 5 per second to stay under HubSpot's 9/sec cap
    const results = [];
    const BATCH = 5;
    for (let i = 0; i < STATUSES.length; i += BATCH) {
      const slice = STATUSES.slice(i, i + BATCH);
      const batchRes = await Promise.all(slice.map(s => countStatus(token, s.key)));
      slice.forEach((s, j) => results.push({ ...s, count: batchRes[j].count, error: batchRes[j].error }));
      if (i + BATCH < STATUSES.length) await sleep(1100);
    }

    const total = results.reduce((sum, r) => sum + (r.count || 0), 0);
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).json({ statuses: results, total, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
