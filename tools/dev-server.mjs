/**
 * Tiny local preview server (no wrangler needed).
 *   node tools/dev-server.mjs      ->  http://localhost:8787
 * Serves the static files and mounts the real Pages Function at /api/weather.
 * With AMAP_KEY in the environment it hits AMap; without it, demo data.
 *
 *   AMAP_KEY=xxx CITY=北京 node tools/dev-server.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8787);

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
      const mod = await import(pathToFileURL(path.join(root, 'functions', 'api', 'weather.js')).href);
      const out = await mod.onRequestGet({
        request: new Request('http://localhost' + req.url),
        env: { AMAP_KEY: process.env.AMAP_KEY || '', CITY: process.env.CITY || '' },
        waitUntil: function () {}
      });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(await out.text());
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('api error: ' + e);
    }
    return;
  }

  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) {
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
