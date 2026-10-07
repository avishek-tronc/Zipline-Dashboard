// Dashboard server. Serves the UI from public/. The page currently uses an
// in-browser mock API; once the Zipline API is known, add proxy routes here
// (see src/adapters/zipline.js) so the API token stays on the server.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "text/plain" });
    let body = fs.readFileSync(file);
    // index.html is written as a page fragment (it is also published as an artifact); give it a doctype here.
    if (file.endsWith(".html") && !/^\s*<!doctype/i.test(body)) body = Buffer.concat([Buffer.from("<!doctype html>\n"), body]);
    res.end(body);
  })
  .listen(PORT, () => console.log(`Zipline Content Dashboard on http://localhost:${PORT}`));
