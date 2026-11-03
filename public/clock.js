/* Kindle Clock - front end
   ES5 only. No fetch, no arrow functions, no template literals, no let/const.
   Kindle 8th gen (Basic 2016) ships a very old WebKit -- anything newer
   silently fails and that is why most web clocks render half-broken there. */

var RELOAD_MS = 10 * 60 * 1000;   // full page refresh: clears e-ink ghosting
var WEATHER_URL = 'api/weather';
var WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
var STORE_KEY = 'kindle-clock-weather';

/* --- fit-to-screen (Kindle viewport height varies with firmware/toolbars) --- */
var SAFE_MARGIN = 8;      // px kept free at the bottom
var MIN_ZOOM = 0.6;
var TIGHT_VIEWPORT = 740; // <= this height -> compact typography first

var lastWeather = null;
var zoomSupported = null;
var lastFootText = '';

function $(id) {
  return document.getElementById(id);
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function setText(id, text) {
  var el = $(id);
  if (el && el.innerHTML !== text) el.innerHTML = text;
}

/* ------------------------------------------------------------------ clock */

/* Always render Beijing time (UTC+8), regardless of the device timezone.
   Kindles and other devices may run on UTC, which would show the wrong hour. */
function nowBeijing() {
  var now = new Date();
  var utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 8 * 3600000);
}

function renderClock() {
  var d = nowBeijing();
  setText('time', pad2(d.getHours()) + ':' + pad2(d.getMinutes()));
  setText('date', (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK_CN[d.getDay()]);
}

/* ------------------------------------------------------------ fit to screen */
/* Old WebKit has no flexbox and no vh unit, so fit the block by hand:
   1) pick compact typography when the viewport is short
   2) if it still overflows, scale the whole block down (never scroll)
   Manual override for real-device calibration: ?zoom=0.92  / debug: ?debug=1 */

function urlParam(name) {
  var s = window.location.search || '';
  var re = new RegExp('[?&]' + name + '=([^&]*)');
  var m = s.match(re);
  return m ? m[1] : null;
}

function applyScale(el, z) {
  if (zoomSupported === null) {
    el.style.zoom = '0.9';
    zoomSupported = (el.style.zoom === '0.9' || el.style.zoom === '0.9px');
    el.style.zoom = '1';
  }
  if (z >= 1) {
    el.style.zoom = '1';
    el.style.webkitTransform = 'none';
    el.style.transform = 'none';
    return;
  }
  if (zoomSupported) {
    el.style.zoom = String(z);
  } else {
    el.style.webkitTransform = 'scale(' + z + ')';
    el.style.transform = 'scale(' + z + ')';
    el.style.webkitTransformOrigin = 'top center';
    el.style.transformOrigin = 'top center';
  }
}

function layout() {
  var wrap = $('wrap');
  if (!wrap) return;

  var vh = document.documentElement.clientHeight || 758;
  var vw = document.documentElement.clientWidth || 600;
  var avail = vh - SAFE_MARGIN;

  wrap.className = (vh <= TIGHT_VIEWPORT) ? 'tight' : '';
  applyScale(wrap, 1);
  wrap.style.paddingTop = '12px';

  var natural = wrap.offsetHeight || 0;
  var forced = parseFloat(urlParam('zoom'));
  var z = 1;

  if (forced > 0.3 && forced <= 1.5) {
    z = forced;
  } else if (natural > avail && natural > 0) {
    z = avail / natural;
    if (z < MIN_ZOOM) z = MIN_ZOOM;
  }

  if (z < 1) {
    applyScale(wrap, z);
    wrap.style.paddingTop = '6px';
  } else {
    // natural was measured with 12px top + 12px bottom padding
    var content = natural - 24;
    var top = Math.floor((vh - content) / 2) - 6;
    if (top < 12) top = 12;
    if (content + top + 12 > vh) top = Math.max(8, vh - content - 12);
    wrap.style.paddingTop = top + 'px';
  }

  if (urlParam('debug')) {
    var foot = $('foot');
    if (foot) {
      foot.innerHTML = lastFootText +
        '<br>vp ' + vw + 'x' + vh + ' &#183; h ' + natural + ' &#183; zoom ' + z.toFixed(2);
    }
  }
}

/* ---------------------------------------------------------------- weather */

function getJSON(url, onOk, onFail) {
  var x;
  try {
    x = new XMLHttpRequest();
  } catch (e) {
    onFail();
    return;
  }
  try {
    x.open('GET', url, true);
  } catch (e2) {
    onFail();
    return;
  }
  x.setRequestHeader && x.setRequestHeader('Accept', 'application/json');
  x.onreadystatechange = function () {
    if (x.readyState === 4) {
      if (x.status === 200 || x.status === 0) {
        var data = null;
        try {
          data = JSON.parse(x.responseText);
        } catch (e3) {
          onFail();
          return;
        }
        if (data) onOk(data); else onFail();
      } else {
        onFail();
      }
    }
  };
  try {
    x.send(null);
  } catch (e4) {
    onFail();
  }
}

function saveCache(data) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    /* localStorage may be disabled on Kindle -- ignore */
  }
}

function loadCache() {
  try {
    var raw = window.localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function renderWeather(data, stale) {
  lastWeather = data;

  setText('city', data.city || '--');
  setText('temp', data.temperature === undefined || data.temperature === null ? '--' : String(data.temperature));
  setText('cond', data.weather || '');

  var wind = (data.winddirection || '--') + '风' + (data.windpower || '--') + '级';
  setText('meta', '湿度' + (data.humidity || '--') + '% &#183; ' + wind);

  var fc = data.forecast || [];
  for (var i = 0; i < 3; i++) {
    var n = i + 1;
    var item = fc[i];
    if (item) {
      var label = item.week || '';
      if (item.date) {
        var p = String(item.date).split('-');
        if (p.length === 3) label = Number(p[1]) + '/' + Number(p[2]) + ' ' + (item.week || '');
      }
      var w = item.dayweather || '';
      if (item.nightweather && item.nightweather !== item.dayweather) {
        w = w + '/' + item.nightweather;
      }
      var range = (item.nighttemp || '--') + '~' + (item.daytemp || '--') + '&#176;';
      setText('fc' + n + 'a', label);
      setText('fc' + n + 'b', w + ' ' + range);
    } else {
      setText('fc' + n + 'a', '--');
      setText('fc' + n + 'b', '--');
    }
  }

  var tips = data.tips || {};
  var greet = tips.greeting || '';
  if (tips.summary) greet += (greet ? ' &#183; ' : '') + tips.summary;
  setText('greet', greet || '--');
  setText('dress', '穿：' + (tips.advice || '暂无建议'));

  var rt = data.reporttime ? String(data.reporttime).slice(11, 16) : '--:--';
  var foot = '天气更新 ' + rt;
  if (data.demo) foot += ' &#183; ' + (data.note || '示例数据');
  if (stale) foot += ' &#183; 离线缓存';
  lastFootText = foot;
  setText('foot', foot);

  layout();
}

function loadWeather() {
  getJSON(WEATHER_URL, function (data) {
    saveCache(data);
    renderWeather(data, false);
  }, function () {
    var cached = loadCache();
    if (cached) {
      renderWeather(cached, true);
    } else {
      setText('city', '天气暂不可用');
      lastFootText = '天气获取失败，稍后自动重试';
      setText('foot', lastFootText);
      layout();
    }
  });
}

/* --------------------------------------------------------------- peeking cat */
/* Not continuous animation -- e-ink refreshes slowly, so the cat only changes
   state every few seconds (a rare partial refresh, cleared by the periodic
   full-page reload anyway). */

function catSetEyes(open) {
  var o = document.getElementById('eyesOpen');
  var c = document.getElementById('eyesClosed');
  if (!o || !c) return;
  o.setAttribute('display', open ? 'inline' : 'none');
  c.setAttribute('display', open ? 'none' : 'inline');
}

function catScheduleBlink() {
  var wait = 4500 + Math.random() * 6500;      // blink every 4.5-11s
  window.setTimeout(function () {
    catSetEyes(false);
    window.setTimeout(function () {
      catSetEyes(true);
      catScheduleBlink();
    }, 400);
  }, wait);
}

function catTwitchOnce(id, cx) {
  var el = document.getElementById(id);
  if (!el) return;
  var seq = [-5, 0, 4, 0];
  var i = 0;
  function step() {
    if (i < seq.length) {
      el.setAttribute('transform', 'rotate(' + seq[i] + ' ' + cx + ' 80)');
      i++;
      window.setTimeout(step, 170);
    } else {
      el.setAttribute('transform', 'rotate(0 ' + cx + ' 80)');
    }
  }
  step();
}

function catScheduleTwitch() {
  var wait = 18000 + Math.random() * 24000;    // twitch every 18-42s
  window.setTimeout(function () {
    if (Math.random() < 0.5) {
      catTwitchOnce('earL', 105);
    } else {
      catTwitchOnce('earR', 195);
    }
    catScheduleTwitch();
  }, wait);
}

/* ---- look around: pupils slide + a slight lean, like turning the head ---- */

var catActing = false;   // simple mutex so duck / look never overlap

function catSetPose(pupilDx, leanDeg) {
  var pL = document.getElementById('pupilL');
  var pR = document.getElementById('pupilR');
  var shape = document.getElementById('catShape');
  if (pL && pR) {
    var t = 'translate(' + pupilDx + ' 0)';
    pL.setAttribute('transform', t);
    pR.setAttribute('transform', t);
  }
  if (shape) {
    shape.setAttribute('transform',
      'translate(-45 0) scale(1.3 1) rotate(' + leanDeg + ' 150 175)');
  }
}

function catLookOnce() {
  catActing = true;
  var dir = Math.random() < 0.5 ? -1 : 1;
  catSetPose(dir * 7, dir * 2.5);                 // look one way
  window.setTimeout(function () {
    catSetPose(-dir * 7, -dir * 2.5);             // then the other
    window.setTimeout(function () {
      catSetPose(0, 0);                           // back to center
      catActing = false;
    }, 1400);
  }, 1400);
}

function catScheduleLook() {
  var wait = 30000 + Math.random() * 50000;       // look around every 30-80s
  window.setTimeout(function () {
    if (!catActing) catLookOnce();
    catScheduleLook();
  }, wait);
}

/* ---- duck down: sink behind the baseline, hide a while, pop back up ---- */

function catSetDuck(dy) {
  var body = document.getElementById('catBody');
  if (body) body.setAttribute('transform', 'translate(0 ' + dy + ')');
}

function catDuckOnce() {
  catActing = true;
  var hideFor = 4200 + Math.random() * 3000;   // decided once, steps stay ordered
  catSetDuck(60);
  window.setTimeout(function () { catSetDuck(130); }, 300);
  window.setTimeout(function () { catSetDuck(180); }, 600);   // fully hidden
  window.setTimeout(function () { catSetDuck(110); }, hideFor);
  window.setTimeout(function () { catSetDuck(50);  }, hideFor + 300);
  window.setTimeout(function () {
    catSetDuck(0);
    catActing = false;
  }, hideFor + 600);
}

function catScheduleDuck() {
  var wait = 150000 + Math.random() * 210000;     // duck every 2.5-6 min
  window.setTimeout(function () {
    if (!catActing) catDuckOnce();
    catScheduleDuck();
  }, wait);
}

function catBoot() {
  var box = $('catbox');
  if (!box) return;
  var ok = false;
  try {
    ok = !!(document.createElementNS &&
      document.createElementNS('http://www.w3.org/2000/svg', 'svg').createSVGRect);
  } catch (e) {
    ok = false;
  }
  if (!ok) {              // no inline SVG -> hide silently, clock still works
    box.style.display = 'none';
    return;
  }
  catScheduleBlink();
  catScheduleTwitch();
  catScheduleLook();
  catScheduleDuck();
}

/* ------------------------------------------------------------------ boot */

function boot() {
  renderClock();
  layout();
  catBoot();
  window.setInterval(renderClock, 1000);
  if (window.addEventListener) {
    window.addEventListener('resize', layout, false);
  } else {
    window.onresize = layout;
  }
  loadWeather();
  // every 10 min: reload the whole page so the e-ink panel does a full refresh
  window.setTimeout(function () {
    try {
      location.reload(true);
    } catch (e) {
      location.reload();
    }
  }, RELOAD_MS);
}

if (window.addEventListener) {
  window.addEventListener('load', boot, false);
} else {
  window.onload = boot;
}
