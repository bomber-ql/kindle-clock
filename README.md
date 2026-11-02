# Kindle Clock

给 **Kindle 第 8 代（2016 款 Basic，600×800 黑白电子墨水屏、无触控）** 做的网页时钟：时间 + 日期 + 实时天气 + 未来 3 天预报 + 问候语 + 穿衣建议，底部还有一只**探头探脑的线条猫咪**——会随机眨眼、抖耳朵。

代码在 GitHub，部署在 **Cloudflare Workers**（静态资源 + Worker，新版统一入口），天气走 **高德开放平台**（key 存在服务端，不进浏览器）。

---

## 一、为什么网上那些时钟在你 Kindle 上显示不完整

Kindle 8 代内置的是一个很老的 WebKit，页面上只要用了下面任一写法，它就会静默失败、只剩半屏：

| 不支持 / 会出错 | 本项目做法 |
|---|---|
| ES6+（`let`、`const`、箭头函数、模板字符串、`fetch`） | 纯 ES5：`var`、`XMLHttpRequest`、字符串 `+` |
| CSS flex / grid / 动画 / 阴影 / 渐变 | table + 块级布局，纯黑白，零动画 |
| 彩色 emoji（会显示成方块） | 天气全部用中文文字（晴 / 多云 / 雨…） |
| 网络字体（`woff2`） | 只用系统字体族（Georgia / 宋体 / 衬线） |

另外电子墨水屏局部刷新会留残影，所以页面每 **10 分钟整页 reload 一次** 触发全局刷新（可在 `clock.js` 里改 `RELOAD_MS`）。

---

## 二、本地预览

```bash
node tools/dev-server.mjs          # http://localhost:8787
```

没配 key 时返回一份按季节生成的**示例数据**（底部会标注"示例数据"），布局可以先看效果。
有 key 了再这样跑，就是真实天气：

```bash
AMAP_KEY=你的key CITY=北京 node tools/dev-server.mjs
```

> 屏幕宽度建议用浏览器开发者工具调到 600×800 查看，最接近 Kindle 实机。

---

## 三、申请高德 key（5 分钟，免费）

1. 打开 <https://console.amap.com/> → 注册/登录 → 应用管理 → 我的应用 → **创建新应用**
2. 应用里点 **添加 Key**，服务平台选 **Web 服务**（选错会报 `INVALID_USER_SCODE`）
3. 复制那串 Key

> 本项目的接口是免费的「天气查询」Web 服务 API，个人开发者额度足够一台 Kindle 用。
> 换城市：改环境变量 `CITY`（支持中文城市名或 adcode，如 `北京` / `110000`）；也可以在网址后加 `?city=上海` 临时试。

---

## 四、部署到 Cloudflare（Workers & Pages 统一入口）

> Cloudflare 新版后台把 Pages 合并进了 Workers：Git 连仓库出来的是 **Worker 项目**，部署命令默认 `npx wrangler deploy`。仓库根目录的 `wrangler.jsonc` 已配好（静态资源在 `public/`，接口在 `src/worker.js`），所以**构建命令留空、部署命令保持默认即可**。

1. 把本仓库推到 GitHub
2. 账号首页 → **Compute (Workers)** → **Workers 和 Pages** → 创建 → **连接到 Git** → 选这个仓库
   （直达链接：`https://dash.cloudflare.com/?to=/:account/workers-and-pages`）
3. "Set up your application" 页面：
   - Project name：`kindle-clock`
   - Build command：**留空**
   - Deploy command：保持默认 `npx wrangler deploy`
   - 点 **Deploy**
4. 部署后进项目 → **Settings → Variables and Secrets（变量和机密）** 添加：
   - `AMAP_KEY` = 你的高德 Key
   - `CITY` = `北京`
5. 保存后**重新部署一次**（Deployments → 最新一条 → Retry），访问 `https://kindle-clock.workers.dev` 就能看到时钟

天气接口在边缘缓存 10 分钟，不会频繁消耗额度；Key 只存在于服务端，`src/worker.js` 里转发，前端拿不到。

---

## 五、保证"一屏装得下"（不会像参考站那样要滑动）

网上常见的 Kindle 时钟（比如 `kw6.netlify.app`）用 **rem + 百分比绝对定位**（`top: 17%`、`top: 24%`…）堆出高度，行数一变、字体一换就会顶出屏幕，差一点点就要滑动才能看全。

本项目不猜高度，而是**开机实测视口后自己收缩**，两级保险：

1. **紧凑档**：`clock.js` 读 `clientHeight`，视口高度 ≤ 740px 时自动给 `#wrap` 加 `tight` 类，字号和间距整体收紧一档（`clock.css` 里的 `#wrap.tight` 段）。
2. **自动缩放**：收紧后仍超出视口，就整体等比缩小（优先用 `zoom`，不支持时退到 `transform: scale()`），下限 0.6。

页面同时 `overflow: hidden`，永远不会出现滚动条。

### 真机校准（两个 URL 参数）

| 参数 | 作用 |
|---|---|
| `?debug=1` | 底部附加一行：`vp 600x733 · h 620 · zoom 1.00`（视口尺寸 / 内容高度 / 缩放比），照抄这行数发我，我能精确调 |
| `?zoom=0.92` | 手动指定缩放，差一点点时用它微调（0.6–1.5） |

例：`https://clock.example.com/?debug=1`

要改默认行为，改 `clock.js` 顶部三个常量：`SAFE_MARGIN`（底部留白）、`TIGHT_VIEWPORT`（触发紧凑档的视口高度）、`MIN_ZOOM`。

---

## 六、绑定你自己的子域名

假设你的域名是 `example.com`，想用 `clock.example.com`：

**A. 域名的 DNS 托管在 Cloudflare（本项目的情况）**
Worker 项目 → **Settings → Domains & Routes（域和路由）** → Add → Custom Domain → 填 `clock.example.com`，因为域名 zone 就在同账号，Cloudflare 自动建记录并签发证书，几分钟生效。

**B. DNS 在别家（阿里云 / 腾讯云 / DNSPod 等）**
1. 先加一条 CNAME：`clock` → `你的项目名.workers.dev`
2. 再到 Worker → Domains & Routes 里填 `clock.example.com`，等证书签发（首次最长约 15 分钟）

国内访问：`*.workers.dev` 与自定义域在国内都可直连，Cloudflare 的节点在国内表现比 Vercel 稳定得多 —— 这也是选 Cloudflare 而不是 Vercel 的原因。

---

## 七、在 Kindle 上使用

1. Kindle 右上角菜单 → **体验版浏览器**（Experimental Browser）
2. 地址栏输入 `clock.example.com`（老浏览器对 `https://` 前缀识别不太稳，直接输域名即可）
3. 进页面后打开菜单，确认 **启用 JavaScript** 是勾选状态
4. 想让它一直亮着：
   - **不越狱**：Kindle 无操作会休眠，唤醒后页面还在，按一下再回浏览器即可
   - **越狱**（推荐）：Kindle 8 代可用 WinterBreak 越狱，装 KUAL 后禁用屏保/定时唤醒，做成真正的常驻桌面时钟

> 老固件可能报"无法验证证书"。先确认系统时间是准确的（时间错会直接导致证书校验失败），仍不行就在浏览器里手动选择"继续访问"（Cloudflare 自定义域的边缘证书对老设备兼容性较好）。

---

## 八、文件说明 & 可调项

```
public/index.html           页面骨架（table 布局，兼容老 WebKit）
public/clock.css            纯黑白样式，600px 宽定版
public/clock.js             前端逻辑：走时、拉天气、离线缓存、定时整页刷新
src/worker.js               Cloudflare Worker：/api/weather 代理高德，其余走静态资源
wrangler.jsonc              Worker 配置（部署命令 npx wrangler deploy 读它）
tools/dev-server.mjs        本地预览服务器
```

| 想改什么 | 改哪里 |
|---|---|
| 整页刷新间隔（默认 10 分钟） | `public/clock.js` 的 `RELOAD_MS` |
| 城市 | Cloudflare 环境变量 `CITY`，或 URL 加 `?city=` |
| 穿衣建议的判据 | `src/worker.js` 的 `dressingAdvice()` |
| 问候语时段文案 | `src/worker.js` 的 `greetingFor()` |
| 字号 / 排版 | `public/clock.css` |
| 数字粗细 | `public/clock.css` 里 `#time` / `#temp` / `#deg` 的 `-webkit-text-stroke`（数值调小变细，设 0 关闭描边） |
| 猫咪（大小/动作频率/关闭） | 造型在 `public/index.html` 的 `<svg id="cat">`，眨眼/抖耳间隔在 `public/clock.js` 的 `catScheduleBlink` / `catScheduleTwitch`，想关掉就把 `public/index.html` 里整个 `#catbox` 删掉 |

猫咪的动作**不是连续动画**：e-ink 刷新慢，所以只是每 4.5–11 秒眨一次眼、每 18–42 秒抖一下耳朵的低频状态切换，残影靠 10 分钟一次的整页刷新清掉。若 Kindle 浏览器不支持 inline SVG，猫咪会静默隐藏，不影响时钟。
| 日期想带年份 | `public/clock.js` 的 `renderClock()`，在前面拼 `d.getFullYear() + '年'` |
| 一屏装不下的兜底 | `public/clock.js` 的 `SAFE_MARGIN` / `TIGHT_VIEWPORT` / `MIN_ZOOM`，`public/clock.css` 的 `#wrap.tight` 段 |

天气拿不到时，页面会退回到上一次成功的数据并标注"离线缓存"，不会开天窗。

---

## 九、常见问题

**还是要滑动才能看全**
打开 `?debug=1`，看底部那行 `vp 600x733 · h 620 · zoom 1.00`。若 zoom 已经小于 1 还差一点，用 `?zoom=0.9` 再压一档；把那行数值发我，我可以直接把默认值写成你机器的。

**页面空白 / 只显示一半**
多半是用了新语法或新 CSS 的第三方时钟。本项目已按老 WebKit 全量降级；若你自己改代码，别引入 `let/const`、箭头函数、`fetch`、flex/grid。

**天气一直是"示例数据"**
说明 `AMAP_KEY` 没读到：确认在 Worker 的 **Settings → Variables and Secrets** 里加了（不是仓库里的 `.dev.vars`，那个只给本地用），并且加完之后**重新部署**过一次。

**时间不对**
Kindle 的浏览器用设备时区，请确认 Kindle 系统时间准确（设置 → 设备和密码 → 时间）。

**国内访问慢**
Cloudflare 在国内一般可直连。若你的网络访问确实不稳，可把 DNS 换到阿里云公共 DNS `223.5.5.5` 再试。
