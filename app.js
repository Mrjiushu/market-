// 全球股市日报 前端：读取 data.json，每 60 秒自动刷新（不整页重载）
const REFRESH_MS = 60 * 1000;
// 各市场时区与交易时段（本地时间，分钟）
const SESSIONS = {
  us: { tz: 'America/New_York', s: [[570, 960]] },               // 9:30-16:00 ET
  hk: { tz: 'Asia/Hong_Kong', s: [[570, 720], [780, 960]] },     // 9:30-12:00, 13:00-16:00
  kr: { tz: 'Asia/Seoul', s: [[540, 930]] },                     // 9:00-15:30 KST
  cn: { tz: 'Asia/Shanghai', s: [[570, 690], [780, 900]] },      // 9:30-11:30, 13:00-15:00
};

const fmt = (v, d = 2) => Number(v).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
const cls = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
const sign = v => (v > 0 ? '+' : '');

function localParts(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute, wd: p.weekday };
}

// 返回 {code: open|lunch|pre|closed|holiday, text}
function marketStatus(m) {
  const cfg = SESSIONS[m.key];
  if (!cfg) return { code: 'closed', text: '已收盘' };
  const { date, min, wd } = localParts(cfg.tz);
  if (wd === 'Sat' || wd === 'Sun') return { code: 'holiday', text: '休市（周末）' };
  const s = cfg.s, first = s[0][0], last = s[s.length - 1][1];
  // 当天已过开盘却仍无当天数据 => 节假日休市
  const noToday = m.data_date && m.data_date < date;
  if (min >= first + 15 && noToday) return { code: 'holiday', text: '休市' };
  if (m.stale && min >= last) return { code: 'holiday', text: '休市' };
  if (s.some(([a, b]) => min >= a && min < b)) return { code: 'open', text: '交易中' };
  if (s.length > 1 && min >= s[0][1] && min < s[1][0]) return { code: 'lunch', text: '午间休市' };
  if (min < first) return { code: 'pre', text: '未开盘' };
  return { code: 'closed', text: '已收盘' };
}

function card(i, intraday) {
  if (!i.available) return `<div class="card"><div class="n">${i.name}</div><div class="p na">暂无数据</div><div class="c na">${i.symbol}</div></div>`;
  const c = cls(i.change);
  return `<div class="card ${c}"><div class="n">${i.name}${intraday ? '<span class="live">盘中</span>' : ''}</div><div class="p">${fmt(i.close)}</div>
    <div class="c ${c}">${sign(i.change)}${fmt(i.change)} (${sign(i.change_pct)}${fmt(i.change_pct)}%)</div></div>`;
}

function row(i) {
  const tag = i.category ? `<span class="tag t-${i.category}">${i.category}</span>` : '';
  const name = `<td>${i.name}${tag}<span class="sym">${i.symbol}</span></td>`;
  if (!i.available) return `<tr>${name}<td class="na" colspan="3">暂无数据</td><td class="na hide-m">-</td></tr>`;
  const c = cls(i.change);
  return `<tr>${name}<td>${fmt(i.close)}</td><td class="${c}">${sign(i.change)}${fmt(i.change)}</td>
    <td><span class="pill ${c}">${sign(i.change_pct)}${fmt(i.change_pct)}%</span></td><td class="hide-m na">${i.date}</td></tr>`;
}

function section(m) {
  const st = marketStatus(m);
  const intraday = st.code === 'open' || st.code === 'lunch';
  const idx = m.items.filter(i => i.type === 'index');
  const stk = m.items.filter(i => i.type === 'stock').sort((a, b) => (b.change_pct ?? -1e9) - (a.change_pct ?? -1e9));
  const note = intraday ? '<span class="delay">盘中 · 延迟行情</span>'
    : (st.code === 'holiday' && m.data_date ? `<span class="closed">数据为 ${m.data_date}</span>` : '');
  return `<section id="${m.key}"><h2>${m.name}<span class="badge b-${st.code}">${st.text}</span>${note}<small>交易日 ${m.data_date || '-'}</small></h2>
    <div class="cards">${idx.map(i => card(i, intraday)).join('')}</div>
    <div class="table"><table><thead><tr><th>AI 概念股</th><th>${intraday ? '最新价' : '收盘价'}</th><th>涨跌额</th><th>涨跌幅</th><th class="hide-m">日期</th></tr></thead>
    <tbody>${stk.map(row).join('')}</tbody></table></div></section>`;
}

let lastData = null;
function render(d) {
  document.getElementById('updated').textContent =
    `最后更新：${d.updated}（北京时间） · 页面每 60 秒自动刷新 · 上次检查 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  const nav = document.getElementById('nav');
  if (!nav.children.length) nav.innerHTML = d.markets.map(m => `<a href="#${m.key}">${m.name}</a>`).join('');
  document.getElementById('app').innerHTML = d.markets.map(section).join('');
}

async function load() {
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    lastData = await r.json();
    render(lastData);
  } catch (e) {
    if (lastData) render(lastData); // 网络抖动时保留旧数据
    else document.getElementById('app').innerHTML = `<p class="na">数据加载失败：${e.message}。请先运行 python update_data.py，并通过本地服务器打开页面。</p>`;
  }
}
load();
setInterval(load, REFRESH_MS);
