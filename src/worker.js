/**
 * Kindle Clock -- Cloudflare Worker
 *
 * - /api/weather  -> proxies AMap (高德) weather so the key never reaches
 *   the browser and the old Kindle WebKit avoids CORS issues.
 * - everything else -> static assets in ./public (wrangler assets binding).
 *
 * Env vars (Cloudflare > Workers & Pages > kindle-clock > Settings > Variables):
 *   AMAP_KEY  - AMap Web service key (申请时服务平台选 "Web服务")
 *   CITY      - city name or adcode, default 北京
 *
 * The weather logic itself lives in shared/weather-core.js, so the self-hosted
 * Node server (server/server.mjs) uses exactly the same code.
 */

import { getWeather } from '../shared/weather-core.js';

var CACHE_SECONDS = 600; // 10 minutes
var CF_FETCH_INIT = { cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true } };

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=' + CACHE_SECONDS
    }
  });
}

async function handleWeather(request, env, ctx) {
  env = env || {};
  var url = new URL(request.url);
  var city = url.searchParams.get('city') || env.CITY || '北京';
  var key = env.AMAP_KEY;

  if (!key) {
    return jsonResponse(await getWeather(null, city));
  }

  var cache = caches.default;
  var cacheKey = new Request(url.toString(), { method: 'GET' });
  var hit = await cache.match(cacheKey);
  if (hit) return hit;

  var body = await getWeather(key, city, CF_FETCH_INIT);
  var response = jsonResponse(body);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname === '/api/weather') {
      return handleWeather(request, env, ctx);
    }
    // Static assets (public/) via the assets binding; falls back to a 404.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('not found', { status: 404 });
  }
};
