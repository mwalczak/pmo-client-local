// Local dev server: serves the board and proxies /v1/* to the PMO API
// (the API sends no CORS headers, so the browser can't call it directly).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const UPSTREAM = process.env.PMO_API ?? "https://pmo.walczaki.com";
const PORT = Number(process.env.PORT ?? 5173);
const PUBLIC = join(import.meta.dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

async function proxy(req, res) {
  const headers = {};
  for (const h of ["authorization", "content-type", "accept", "range"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const upstream = await fetch(UPSTREAM + req.url, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? "half" : undefined,
  });
  const out = {};
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition"]) {
    const v = upstream.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(upstream.status, out);
  if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}

async function serveStatic(req, res) {
  const path = new URL(req.url, "http://x").pathname;
  const file = normalize(join(PUBLIC, path === "/" ? "index.html" : path));
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/v1/")) await proxy(req, res);
    else await serveStatic(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad_gateway", message: String(err.message ?? err) }));
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`PMO board: http://localhost:${PORT}  (proxying ${UPSTREAM})`);
});
