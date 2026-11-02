/**
 * Self-hosted server for the Kindle Clock (zero dependencies, Node 18+).
 *
 *   PORT=8787 AMAP_KEY=xxx CITY=北京 node server/server.mjs
 *
 * Serves public/ (index.html, clock.css, clock.js) and /api/weather.
 * The AMap key stays on the server; the browser only ever sees weather data.
 * Weather responses are cached in memory for 10 minutes.
 *
 * In production put Nginx in front of it (see deploy/nginx/kindle-clock.conf)
 * and run it under systemd (see deploy/systemd/kindle-clock.service).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWeather } from '../shared/weather-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pubDir = path.join(root, 'public');
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const CITY = process.env.CITY || '北京';
const AMAP_KEY = process.env.AMAP_KEY || '';
const CACHE_MS = 10 * 60 * 1000; // 10 minutes, same as the Worker

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8'
};

/* ------------------------------------------------------------ weather cache */

const cache = new Map(); // city -> { at: number, body: object }

async function weatherFor(city) {
  const now = Date.now();
  const hit = cache.get(city);
  if (hit && (now - hit.at) < CACHE_MS) return hit.body;

  const body = await getWeather(AMAP_KEY, city);
  cache.set(city, { at: now, body: body });
  return body;
}

/* -------------------------------------------------------------- http server */

function sendJson(res, body) {
  const buf = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': buf.length,
    'cache-control': 'public, max-age=600'
  });
  res.end(buf);
}

function sendFile(res, file) {
  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'content-length': buf.length
    });
    res.end(buf);
  });
}

const server = http.createServer(function (req, res) {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    pathname = '/';
  }

  if (pathname === '/api/weather') {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const city = q.get('city') || CITY;
    weatherFor(city).then(function (body) {
      sendJson(res, body);
    }).catch(function (e) {
      sendJson(res, { ok: false, error: String(e) });
    });
    return;
  }

  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(pubDir, rel);
  if (!file.startsWith(pubDir)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  sendFile(res, file);
});

server.listen(port, host, function () {
  console.log('Kindle Clock listening on http://' + host + ':' + port);
  console.log('city=' + CITY + '  amap_key=' + (AMAP_KEY ? 'set' : 'MISSING (demo data)'));
});
