/**
 * Platform-agnostic weather core.
 * Shared by the Cloudflare Worker (src/worker.js) and the self-hosted
 * Node server (server/server.mjs). No platform-specific APIs here --
 * `fetch` is global in both runtimes.
 *
 * AMap docs: https://lbs.amap.com/api/webservice/guide/api/weatherinfo/
 */

var WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * AMap says the `city` parameter takes an adcode. Chinese names usually
 * work too, but common ones are mapped here so the request is unambiguous.
 */
var CITY_ADCODE = {
  '北京': '110000', '北京市': '110000',
  '上海': '310000', '上海市': '310000',
  '广州': '440100', '广州市': '440100',
  '深圳': '440300', '深圳市': '440300',
  '天津': '120000', '天津市': '120000',
  '重庆': '500000', '重庆市': '500000',
  '杭州': '330100', '南京': '320100', '苏州': '320500',
  '成都': '510100', '武汉': '420100', '西安': '610100',
  '郑州': '410100', '长沙': '430100', '青岛': '370200',
  '沈阳': '210100', '大连': '210200', '哈尔滨': '230100', '长春': '220100',
  '济南': '370100', '合肥': '340100', '福州': '350100', '厦门': '350200',
  '南昌': '360100', '昆明': '530100', '贵阳': '520100', '南宁': '450100',
  '石家庄': '130100', '太原': '140100', '兰州': '620100'
};

export function cityToAdcode(city) {
  return CITY_ADCODE[city] || city;
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

/** Beijing hour (servers usually run on UTC). */
function beijingNow() {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

function beijingDateText(d) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

function weekOf(dateStr) {
  var p = dateStr.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  return WEEK_CN[d.getUTCDay()];
}

export function greetingFor(hour) {
  if (hour >= 5 && hour < 8) return '早安，新的一天开始了';
  if (hour >= 8 && hour < 11) return '上午好，保持专注';
  if (hour >= 11 && hour < 13) return '午间好，记得好好吃饭';
  if (hour >= 13 && hour < 18) return '下午好，别忘了喝水';
  if (hour >= 18 && hour < 22) return '晚上好，放松一下';
  return '夜深了，早点休息';
}

export function dressingAdvice(temp, nightTemp, weather, windPower) {
  var t = Number(temp);
  var advice;

  if (!isFinite(t)) {
    advice = '暂无穿衣建议';
  } else if (t >= 30) {
    advice = '短袖短裤，注意防晒补水';
  } else if (t >= 26) {
    advice = '短袖 + 薄长裤，透气为主';
  } else if (t >= 22) {
    advice = '长袖T恤，早晚加件薄外套';
  } else if (t >= 18) {
    advice = '长袖 + 薄外套';
  } else if (t >= 12) {
    advice = '外套或针织衫，早晚偏凉';
  } else if (t >= 6) {
    advice = '毛衣 + 厚外套';
  } else if (t >= 0) {
    advice = '棉服或薄羽绒';
  } else {
    advice = '厚羽绒服 + 保暖内衣';
  }

  var nt = Number(nightTemp);
  if (isFinite(t) && isFinite(nt) && (t - nt) >= 8) {
    advice += '；昼夜温差大，早晚多穿一件';
  }
  if (/雨/.test(weather || '')) {
    advice += '；有雨，出门带伞';
  }
  if (/雪/.test(weather || '')) {
    advice += '；有雪，注意防滑保暖';
  }
  var wp = parseInt(String(windPower || '').replace(/[^0-9]/g, ''), 10);
  if (isFinite(wp) && wp >= 5) {
    advice += '；风大，选件防风的';
  }
  return advice;
}

export function demoData(city, note) {
  var now = beijingNow();
  var hour = now.getUTCHours();
  var month = now.getUTCMonth() + 1;
  var seasonalHigh = [4, 6, 12, 20, 26, 30, 31, 30, 26, 20, 12, 6][month - 1];
  var temp = seasonalHigh - 2;
  var night = seasonalHigh - 10;

  var casts = [];
  for (var i = 0; i < 4; i++) {
    var d = new Date(now.getTime() + i * 86400000);
    casts.push({
      date: beijingDateText(d),
      week: weekOf(beijingDateText(d)),
      dayweather: i === 2 ? '多云' : '晴',
      nightweather: i === 2 ? '阴' : '晴',
      daytemp: String(seasonalHigh - i),
      nighttemp: String(night - i)
    });
  }

  return {
    ok: true,
    demo: true,
    city: city,
    weather: '晴',
    temperature: temp,
    humidity: '45',
    winddirection: '西南',
    windpower: '≤3',
    reporttime: beijingDateText(now) + ' ' + pad(hour) + ':' + pad(now.getUTCMinutes()) + ':00',
    forecast: casts.slice(1, 4),
    tips: {
      greeting: greetingFor(hour),
      advice: dressingAdvice(temp, night, '晴', '≤3'),
      summary: '今日晴，' + seasonalHigh + '°/' + night + '°'
    },
    note: note || '示例数据：未配置 AMAP_KEY'
  };
}

async function fetchAMap(key, city, extensions, init) {
  var url = 'https://restapi.amap.com/v3/weather/weatherInfo' +
    '?key=' + encodeURIComponent(key) +
    '&city=' + encodeURIComponent(cityToAdcode(city)) +
    '&extensions=' + extensions +
    '&output=JSON';
  var res = await fetch(url, init || undefined);
  return res.json();
}

/**
 * Returns a plain object ready to be JSON-serialised.
 * Falls back to demo data (with a `note` explaining why) on any failure.
 */
export async function getWeather(key, city, init) {
  city = city || '北京';

  if (!key) {
    return demoData(city);
  }

  try {
    var base = await fetchAMap(key, city, 'base', init);
    var all = await fetchAMap(key, city, 'all', init);

    // AMap reports failures as status "0" + info/infocode, e.g.
    // INVALID_USER_SCODE when the key was created for the wrong platform.
    if (!base || base.status === '0') {
      return demoData(city, '高德错误：' + ((base && (base.info || base.infocode)) || '无响应'));
    }

    var lives = (base.lives && base.lives[0]) || null;
    var forecast = (all && all.forecasts && all.forecasts[0]) || null;
    var casts = (forecast && forecast.casts) || [];

    if (!lives) {
      return demoData(city, '高德无实况数据：' + ((base && base.info) || '未知'));
    }

    var now = beijingNow();
    var hour = now.getUTCHours();
    var today = casts[0] || null;
    var temp = lives.temperature;
    var nightTemp = today ? today.nighttemp : null;

    var fc = [];
    for (var i = 1; i < 4 && i < casts.length; i++) {
      var c = casts[i];
      fc.push({
        date: c.date,
        week: weekOf(c.date),
        dayweather: c.dayweather,
        nightweather: c.nightweather,
        daytemp: c.daytemp,
        nighttemp: c.nighttemp
      });
    }

    var summary = '';
    if (today) {
      summary = '今日' + today.dayweather +
        (today.nightweather && today.nightweather !== today.dayweather
          ? '转' + today.nightweather : '') +
        '，' + today.daytemp + '°/' + today.nighttemp + '°';
    }

    return {
      ok: true,
      demo: false,
      city: lives.city || city,
      weather: lives.weather,
      temperature: temp,
      humidity: lives.humidity,
      winddirection: lives.winddirection,
      windpower: lives.windpower,
      reporttime: lives.reporttime,
      forecast: fc,
      tips: {
        greeting: greetingFor(hour),
        advice: dressingAdvice(temp, nightTemp, lives.weather, lives.windpower),
        summary: summary
      }
    };
  } catch (e) {
    return demoData(city, '天气服务暂不可用');
  }
}
