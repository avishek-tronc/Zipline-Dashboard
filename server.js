// Dashboard server. Serves the UI from public/. The page currently uses an
// in-browser mock API; once the Zipline API is known, add proxy routes here
// (see src/adapters/zipline.js) so the API token stays on the server.
//
// Also handles admin login (cookie session) and visitor analytics: each load of
// the dashboard page is recorded with the visitor's IP and geography, and the
// Analytics page (/analytics) shows them to a logged-in admin.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const analytics = require("./src/analytics");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const PAGES = path.join(__dirname, "pages");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const ADMIN_USER = process.env.ADMIN_USER || "Admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "Admin";
const SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> { user, expires }

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookieAttrs(req) {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `; Path=/; HttpOnly; SameSite=Lax${secure}`;
}
function currentUser(req) {
  const token = cookies(req).zd_session;
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return s.user;
}
const same = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(data));
}
function readBody(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > limit) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
function sendHtml(res, file, extraHeaders = {}) {
  let body = fs.readFileSync(file);
  // index.html is written as a page fragment (it is also published as an artifact); give it a doctype here.
  if (!/^\s*<!doctype/i.test(body)) body = Buffer.concat([Buffer.from("<!doctype html>\n"), body]);
  res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store", ...extraHeaders });
  res.end(body);
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/session" && req.method === "GET") {
    const user = currentUser(req);
    return sendJson(res, 200, { loggedIn: !!user, user });
  }
  if (url.pathname === "/api/login" && req.method === "POST") {
    let creds = {};
    try { creds = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: "Invalid request" }); }
    if (!same(creds.username ?? "", ADMIN_USER) || !same(creds.password ?? "", ADMIN_PASS)) {
      return sendJson(res, 401, { error: "Incorrect username or password" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { user: ADMIN_USER, expires: Date.now() + SESSION_MS });
    return sendJson(res, 200, { loggedIn: true, user: ADMIN_USER },
      { "Set-Cookie": `zd_session=${token}${cookieAttrs(req)}; Max-Age=${SESSION_MS / 1000}` });
  }
  if (url.pathname === "/api/logout" && req.method === "POST") {
    sessions.delete(cookies(req).zd_session);
    return sendJson(res, 200, { loggedIn: false }, { "Set-Cookie": `zd_session=${cookieAttrs(req)}; Max-Age=0` });
  }
  if (url.pathname === "/api/analytics" && req.method === "GET") {
    if (!currentUser(req)) return sendJson(res, 401, { error: "Login required" });
    return sendJson(res, 200, analytics.summary());
  }
  return sendJson(res, 404, { error: "Not found" });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end("ok");
      }
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
      if (url.pathname === "/analytics") {
        if (!currentUser(req)) { res.writeHead(302, { Location: "/?login=analytics" }); return res.end(); }
        return sendHtml(res, path.join(PAGES, "analytics.html"));
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        // Record the view; a long-lived visitor cookie lets distinct visitors be told apart from repeat views.
        let vid = cookies(req).zd_vid;
        const headers = {};
        if (!/^[a-f0-9]{32}$/.test(vid || "")) {
          vid = crypto.randomBytes(16).toString("hex");
          headers["Set-Cookie"] = `zd_vid=${vid}${cookieAttrs(req)}; Max-Age=${400 * 24 * 3600}`;
        }
        analytics.record({ ip: analytics.clientIp(req), visitorId: vid, userAgent: req.headers["user-agent"] || "", path: "/" });
        return sendHtml(res, path.join(PUBLIC, "index.html"), headers);
      }
      const file = path.join(PUBLIC, url.pathname);
      if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end("Not found");
      }
      if (file.endsWith(".html")) return sendHtml(res, file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "text/plain" });
      res.end(fs.readFileSync(file));
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end("Server error");
    }
  })
  .listen(PORT, "0.0.0.0", () => console.log(`Zipline Content Dashboard on http://localhost:${PORT}`));
