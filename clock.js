/* Kindle Clock - front end
   ES5 only. No fetch, no arrow functions, no template literals, no let/const.
   Kindle 8th gen (Basic 2016) ships a very old WebKit -- anything newer
   silently fails and that is why most web clocks render half-broken there. */

var RELOAD_MS = 10 * 60 * 1000;   // full page refresh: clears e-ink ghosting
var WEATHER_URL = 'api/weather';
var WEEK_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
var STORE_KEY = 'kindle-clock-weather';

var lastWeather = null;

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

function renderClock() {
  var d = new Date();
  setText('time', pad2(d.getHours()) + ':' + pad2(d.getMinutes()));
  setText('date', d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK_CN[d.getDay()]);
}

/* --------------------------------------------------------------- vertical */
/* Old WebKit has no flexbox, so center the block by padding math. */

function centerVertically() {
  var wrap = $('wrap');
  if (!wrap) return;
  var vh = document.documentElement.clientHeight || 758;
  var h = wrap.offsetHeight || 0;
  var top = Math.floor((vh - h) / 2) - 10;
  if (top < 8) top = 8;
  wrap.style.paddingTop = top + 'px';
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

  var wind = (data.winddirection || '--') + '风 ' + (data.windpower || '--') + '级';
  setText('meta', '湿度 ' + (data.humidity || '--') + '% &#183; ' + wind);

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
      if (item.nightweather && item.nightweather !== item.dayweather) w += '转' + item.nightweather;
      setText('fc' + n + 'a', label);
      setText('fc' + n + 'b', w);
      setText('fc' + n + 'c', (item.nighttemp || '--') + '&#176; ~ ' + (item.daytemp || '--') + '&#176;');
    } else {
      setText('fc' + n + 'a', '--');
      setText('fc' + n + 'b', '--');
      setText('fc' + n + 'c', '--');
    }
  }

  var tips = data.tips || {};
  var greet = tips.greeting || '';
  if (tips.summary) greet += (greet ? ' &#183; ' : '') + tips.summary;
  setText('greet', greet || '--');
  setText('dress', '穿：' + (tips.advice || '暂无建议'));

  var rt = data.reporttime ? String(data.reporttime).slice(11, 16) : '--:--';
  var foot = '天气更新 ' + rt;
  if (data.demo) foot += ' &#183; 示例数据';
  if (stale) foot += ' &#183; 离线缓存';
  setText('foot', foot);

  centerVertically();
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
      setText('foot', '天气获取失败，稍后自动重试');
      centerVertically();
    }
  });
}

/* ------------------------------------------------------------------ boot */

function boot() {
  renderClock();
  window.setInterval(renderClock, 1000);
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
