// Visitor analytics: records dashboard page views with IP, visitor id and
// geography, and summarises them for the Analytics page.
//
// Data is kept in memory and saved to $DATA_DIR/analytics.json (default ./data).
// On hosts with an ephemeral disk (e.g. Render's free plan) that file is lost on
// redeploy; point DATA_DIR at a persistent disk to keep it.
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "analytics.json");
const MAX_VIEWS = 5000; // individual view rows kept; totals are kept separately and never trimmed
const GEO_TTL = 7 * 24 * 3600 * 1000;

let db = { totalViews: 0, views: [], visitors: {}, ips: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch { /* first run */ }

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE + ".tmp", JSON.stringify(db));
      fs.renameSync(FILE + ".tmp", FILE);
    } catch (err) { console.error("analytics save failed:", err.message); }
  }, 2000);
}

// Render (and most hosts) sit behind a proxy, so the socket address is the proxy's.
function clientIp(req) {
  const h = req.headers;
  const ip = h["true-client-ip"] || h["cf-connecting-ip"] || (h["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
  return ip.replace(/^::ffff:/, "");
}

function isPrivate(ip) {
  return !ip || ip === "::1" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc|fd|fe80)/i.test(ip);
}

async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
// Free lookup services, tried in order; no API key needed.
async function lookupGeo(ip) {
  if (isPrivate(ip)) return { country: "Local network", countryCode: "", region: "", city: "" };
  try {
    const j = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code,region,city`);
    if (j.success) return { country: j.country || "Unknown", countryCode: j.country_code || "", region: j.region || "", city: j.city || "" };
  } catch { /* try the next service */ }
  try {
    const j = await fetchJson(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city`);
    if (j.status === "success") return { country: j.country || "Unknown", countryCode: j.countryCode || "", region: j.regionName || "", city: j.city || "" };
  } catch { /* fall through */ }
  return null;
}

const pending = new Set();
function resolveGeo(ip) {
  const rec = db.ips[ip];
  if (pending.has(ip) || (rec.geo && Date.now() - (rec.geoAt || 0) < GEO_TTL)) return;
  pending.add(ip);
  lookupGeo(ip)
    .then((geo) => {
      if (geo) { rec.geo = geo; rec.geoAt = Date.now(); }
      for (const v of db.views) if (v.ip === ip && !v.geo) v.geo = rec.geo;
      save();
    })
    .finally(() => pending.delete(ip));
}

function record({ ip, visitorId, userAgent, path: p }) {
  const ts = Date.now();
  db.totalViews++;
  const rec = (db.ips[ip] ||= { views: 0, firstSeen: ts, lastSeen: ts, geo: null });
  rec.views++; rec.lastSeen = ts;
  const vis = (db.visitors[visitorId] ||= { views: 0, firstSeen: ts, lastSeen: ts });
  vis.views++; vis.lastSeen = ts;
  db.views.push({ ts, ip, visitorId, path: p, userAgent: userAgent.slice(0, 200), geo: rec.geo || null });
  if (db.views.length > MAX_VIEWS) db.views.splice(0, db.views.length - MAX_VIEWS);
  resolveGeo(ip);
  save();
}

function summary() {
  const now = Date.now(), DAY = 86400000;
  const byCountry = {};
  for (const [ip, r] of Object.entries(db.ips)) {
    const c = r.geo?.country || "Unknown";
    const row = (byCountry[c] ||= { country: c, countryCode: r.geo?.countryCode || "", views: 0, ips: 0 });
    row.views += r.views; row.ips++;
  }
  // Views per day for the last 14 days (server's UTC days), with distinct visitors per day.
  const days = [];
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) days.push({ day: new Date(start.getTime() - i * DAY).toISOString().slice(0, 10), views: 0, visitors: new Set() });
  const first = start.getTime() - 13 * DAY;
  for (const v of db.views) {
    if (v.ts < first) continue;
    const d = days[Math.floor((v.ts - first) / DAY)];
    if (d) { d.views++; d.visitors.add(v.visitorId); }
  }
  const today = days[days.length - 1];
  return {
    generatedAt: now,
    totals: {
      views: db.totalViews,
      distinctVisitors: Object.keys(db.visitors).length,
      uniqueIps: Object.keys(db.ips).length,
      countries: Object.keys(byCountry).filter((c) => c !== "Unknown" && c !== "Local network").length,
      viewsToday: today.views,
      visitorsToday: today.visitors.size,
    },
    daily: days.map((d) => ({ day: d.day, views: d.views, visitors: d.visitors.size })),
    byCountry: Object.values(byCountry).sort((a, b) => b.views - a.views),
    byIp: Object.entries(db.ips)
      .map(([ip, r]) => ({ ip, views: r.views, firstSeen: r.firstSeen, lastSeen: r.lastSeen, ...(r.geo || { country: "Unknown", city: "", region: "" }) }))
      .sort((a, b) => b.lastSeen - a.lastSeen),
    recent: db.views.slice(-100).reverse(),
  };
}

module.exports = { record, summary, clientIp };
