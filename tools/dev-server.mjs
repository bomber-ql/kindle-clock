/**
 * Tiny local preview server (no wrangler needed).
 *   node tools/dev-server.mjs      ->  http://localhost:8787
 * Serves public/ and mounts the real Worker (src/worker.js) at /api/weather.
 * With AMAP_KEY in the environment it hits AMap; without it, demo data.
 *
 *   AMAP_KEY=xxx CITY=北京 node tools/dev-server.mjs
 *
 * It also auto-loads a .dev.vars file in the project root (KEY=value lines),
 * so you can just drop your key there instead of typing it every time.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pubDir = path.join(root, 'public');
const port = Number(process.env.PORT || 8787);

/* Read .dev.vars (same format wrangler uses) into process.env if present. */
(function loadDevVars() {
  try {
    const txt = fs.readFileSync(path.join(root, '.dev.vars'), 'utf8');
    txt.split(/\r?\n/).forEach(function (line) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) return;
      if (process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    });
  } catch (e) { /* no .dev.vars -> fall back to real env vars */ }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/api/weather') {
    try {
      const mod = await import(pathToFileURL(path.join(root, 'src', 'worker.js')).href);
      const out = await mod.default.fetch(
        new Request('http://localhost' + req.url),
        { AMAP_KEY: process.env.AMAP_KEY || '', CITY: process.env.CITY || '' },
        { waitUntil: function () {} }
      );
      res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(await out.text());
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('api error: ' + e);
    }
    return;
  }

  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(pubDir, rel);
  if (!file.startsWith(pubDir)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(port, function () {
  console.log('Kindle Clock preview: http://localhost:' + port);
});
