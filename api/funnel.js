// Vercel serverless function — GET /api/funnel
// Returns lead counts per hs_lead_status value, live from HubSpot.
// Token stored in Vercel env var HUBSPOT_TOKEN (never in source).

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

async function countStatus(token, value) {
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
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { count: 0, error: r.status, detail: text.slice(0, 200) };
  }
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
    const results = await Promise.all(
      STATUSES.map(async (s) => {
        const { count, error, detail } = await countStatus(token, s.key);
        return { ...s, count, error, detail };
      })
    );

    const total = results.reduce((sum, r) => sum + (r.count || 0), 0);

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).json({ statuses: results, total, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
