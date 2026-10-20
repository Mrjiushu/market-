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
    <tbody>${stk.map(row).join('')}</tbody></table></div>${newsBlock(m, lastData && lastData.news)}</section>`;
}


const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function spark(h, c) {
  if (!h || h.length < 2) return '';
  const W = 300, H = 90, P = 4, v = h.map(x => x[1]);
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const pts = v.map((y, i) => [P + i * (W - 2 * P) / (v.length - 1), P + (H - 2 * P) * (1 - (y - mn) / r)]);
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const col = c === 'up' ? 'var(--up)' : c === 'down' ? 'var(--down)' : 'var(--flat)';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark">
    <polygon points="${P},${H - P} ${line} ${W - P},${H - P}" fill="${col}" opacity=".12"/>
    <polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="axis"><span>${h[0][0].slice(5)}</span><span>低 ${fmt(mn, v[0] < 10 ? 4 : 2)} · 高 ${fmt(mx, v[0] < 10 ? 4 : 2)}</span><span>${h[h.length - 1][0].slice(5)}</span></div>`;
}

function fxSection(fx) {
  if (!fx || !fx.length) return '';
  return `<section id="fx"><h2>汇率<small>近 30 个交易日 · 美元兑人民币/日元/韩元</small></h2><div class="fx">${fx.map(f => {
    const c = cls(f.change), d = f.rate < 10 ? 4 : 2;
    return `<div class="card ${c}"><div class="n">${f.name} <span class="sym">${f.pair}</span></div><div class="p">${fmt(f.rate, d)}</div>
      <div class="c ${c}">${sign(f.change)}${fmt(f.change, d)} (${sign(f.change_pct)}${fmt(f.change_pct)}%)</div>${spark(f.history, c)}</div>`;
  }).join('')}</div></section>`;
}

function newsBlock(m, news) {
  const seen = new Set(), all = [];
  for (const x of ((news || {})[m.key] || [])) for (const n of (x.news || [])) {
    const k1 = n.link, k2 = (n.title || '').trim();
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1); seen.add(k2); all.push(n);
  }
  if (!all.length) return '';
  all.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  const li = n => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a><span class="meta">${esc(n.source)}<i>·</i>${esc(n.time)}</span></li>`;
  const N = 8, more = all.slice(N);
  return `<div class="newsbox"><h3>${m.name}资讯</h3><ul class="nlist">${all.slice(0, N).map(li).join('')}</ul>${more.length ?
    `<details data-k="${m.key}"><summary>展开更多 ${more.length} 条</summary><ul class="nlist">${more.map(li).join('')}</ul></details>` : ''}</div>`;
}

let lastData = null;
function render(d) {
  lastData = d;
  document.getElementById('updated').textContent =
    `最后更新：${d.updated}（北京时间） · 页面每 60 秒自动刷新 · 上次检查 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  const nav = document.getElementById('nav');
  if (!nav.children.length) nav.innerHTML = d.markets.map(m => `<a href="#${m.key}">${m.name}</a>`).join('')
    + (d.fx && d.fx.length ? '<a href="#fx">汇率</a>' : '');
  const open = new Set([...document.querySelectorAll('.newsbox details[open]')].map(x => x.dataset.k));
  document.getElementById('app').innerHTML = d.markets.map(section).join('') + fxSection(d.fx);
  document.querySelectorAll('.newsbox details').forEach(x => { if (open.has(x.dataset.k)) x.open = true; });
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
