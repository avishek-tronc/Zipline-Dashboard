// Zipline API adapter. Fill in ENDPOINT and mapItem() once the API docs are known.
const BASE = process.env.ZIPLINE_BASE_URL;
const TOKEN = process.env.ZIPLINE_API_TOKEN;
const ENDPOINT = "/content?status=scheduled"; // TODO: real endpoint (REST) or GraphQL query

// TODO: map Zipline's raw fields to the normalized shape used by the UI.
function mapItem(raw) {
  return {
    id: String(raw.id),
    title: raw.title,
    type: raw.embargo_until ? "embargo" : "auto_publish",
    scheduledAt: raw.publish_at || null,
    embargoUntil: raw.embargo_until || null,
    status: raw.status || "scheduled",
    section: raw.section || null,
    author: raw.author || null,
    url: raw.url || null,
  };
}

exports.listItems = async () => {
  if (!BASE || !TOKEN) throw new Error("Set ZIPLINE_BASE_URL and ZIPLINE_API_TOKEN in .env");
  const res = await fetch(BASE + ENDPOINT, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Zipline API returned ${res.status}`);
  const body = await res.json();
  return (Array.isArray(body) ? body : body.items || body.data || []).map(mapItem);
};
