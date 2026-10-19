#!/usr/bin/env python3
"""抓取美股/港股/韩股/A股 主要指数与 AI 概念股行情，写入 data.json。
盘中运行得到最新价（相对昨收的涨跌），收盘后运行得到收盘价。
主数据源 yfinance（批量下载），失败或缺失时用新浪财经补充。"""
import json, math, re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import urllib.request
import yfinance as yf

# 新浪代码特例（指数）；其余 .SS/.SZ/.HK 自动转换
SINA_SPECIAL = {"^HSTECH": "hkHSTECH", "^HSI": "hkHSI"}

def sina_code(symbol):
    if symbol in SINA_SPECIAL:
        return SINA_SPECIAL[symbol]
    m = re.fullmatch(r"(\d{6})\.(SS|SZ)", symbol)
    if m:
        return ("sh" if m.group(2) == "SS" else "sz") + m.group(1)
    m = re.fullmatch(r"(\d{4,5})\.HK", symbol)
    if m:
        return "hk" + m.group(1).zfill(5)
    return None

def fetch_sina_batch(symbols):
    """一次请求取多个新浪行情，返回 {symbol: row}"""
    codes = {sina_code(s): s for s in symbols if sina_code(s)}
    if not codes:
        return {}
    req = urllib.request.Request("https://hq.sinajs.cn/list=" + ",".join(codes),
                                 headers={"Referer": "https://finance.sina.com.cn", "User-Agent": "Mozilla/5.0"})
    txt = urllib.request.urlopen(req, timeout=15).read().decode("gbk", "ignore")
    out = {}
    for code, body in re.findall(r'hq_str_(\w+)="([^"]*)"', txt):
        f = body.split(",")
        try:
            if code.startswith("hk"):
                prev, last, date = float(f[3]), float(f[6]), f[17].replace("/", "-")
            else:
                prev, last, date = float(f[2]), float(f[3]), f[30]
            if prev <= 0 or last <= 0:
                continue
            chg = last - prev
            out[codes[code]] = {"close": round(last, 2), "change": round(chg, 2),
                                "change_pct": round(chg / prev * 100, 2), "date": date, "source": "sina"}
        except (IndexError, ValueError):
            continue
    return out

def fetch_yf_batch(symbols):
    """yfinance 批量取近 10 天日线；当天未收盘时最后一根就是盘中最新价"""
    df = yf.download(symbols, period="10d", interval="1d", group_by="ticker",
                     auto_adjust=False, progress=False, threads=True)
    out = {}
    for s in symbols:
        try:
            c = df[s]["Close"].dropna()
            if len(c) < 2:
                continue
            last, prev = float(c.iloc[-1]), float(c.iloc[-2])
            if math.isnan(last) or prev == 0:
                continue
            chg = last - prev
            out[s] = {"close": round(last, 2), "change": round(chg, 2),
                      "change_pct": round(chg / prev * 100, 2), "date": c.index[-1].strftime("%Y-%m-%d"), "source": "yfinance"}
        except Exception:
            continue
    return out

# (代码, 名称, 类型, 分类)
MARKETS = [
    ("us", "美股", "America/New_York", 16, [("^GSPC","标普500","index",""),("^IXIC","纳斯达克","index",""),("^DJI","道琼斯","index",""),
        ("NVDA","英伟达","stock","AI芯片"),("AVGO","博通","stock","AI芯片"),
        ("MU","美光科技","stock","存储"),("WDC","西部数据","stock","存储"),("SNDK","闪迪","stock","存储"),
        ("MSFT","微软","stock","大模型"),("GOOGL","谷歌","stock","大模型"),("META","Meta","stock","大模型"),
        ("COHR","Coherent","stock","光模块"),("LITE","Lumentum","stock","光模块")]),
    ("hk", "港股", "Asia/Hong_Kong", 16, [("^HSI","恒生指数","index",""),("^HSTECH","恒生科技","index",""),
        ("0700.HK","腾讯控股","stock","大模型"),("9988.HK","阿里巴巴","stock","大模型"),
        ("2513.HK","智谱","stock","大模型"),("0100.HK","MiniMax","stock","大模型"),
        ("0981.HK","中芯国际","stock","AI芯片"),("1810.HK","小米集团","stock","大模型")]),
    ("kr", "韩股", "Asia/Seoul", 16, [("^KS11","KOSPI","index",""),("^KQ11","KOSDAQ","index",""),
        ("005930.KS","三星电子","stock","存储"),("000660.KS","SK海力士","stock","存储"),
        ("042700.KS","韩美半导体","stock","AI芯片"),("035420.KS","NAVER","stock","大模型")]),
    ("cn", "A股", "Asia/Shanghai", 15, [("000001.SS","上证指数","index",""),("000688.SS","科创50","index",""),("399006.SZ","创业板指","index",""),
        ("000300.SS","沪深300","index",""),
        ("300308.SZ","中际旭创","stock","光模块"),("300502.SZ","新易盛","stock","光模块"),("300394.SZ","天孚通信","stock","光模块"),
        ("603986.SS","兆易创新","stock","存储"),("301308.SZ","江波龙","stock","存储"),("688825.SS","长鑫科技","stock","存储"),
        ("002230.SZ","科大讯飞","stock","大模型"),("688256.SS","寒武纪","stock","AI芯片")]),
]

def expected_date(tz, close_hour):
    """该市场最近一个“应已收盘”的工作日（不含节假日判断）"""
    now = datetime.now(ZoneInfo(tz))
    d = now.date()
    if now.hour < close_hour:
        d -= timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d.isoformat()

def main():
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    out = {"updated": now.strftime("%Y-%m-%d %H:%M:%S"), "updated_iso": now.isoformat(timespec="seconds"),
           "timezone": "Asia/Shanghai", "markets": []}
    all_syms = [it[0] for m in MARKETS for it in m[4]]
    try:
        yfd = fetch_yf_batch(all_syms)
    except Exception as e:
        print("yfinance 批量失败:", e); yfd = {}
    # A股/港股：新浪是实时行情，比 yfinance 更及时；同一交易日取新浪
    try:
        sina = fetch_sina_batch(all_syms)
    except Exception as e:
        print("新浪失败:", e); sina = {}
    failed = []
    for key, name, tz, close_hour, items in MARKETS:
        rows = []
        for sym, cn, typ, cat in items:
            row = {"symbol": sym, "name": cn, "type": typ, "category": cat, "available": False}
            a, b = yfd.get(sym), sina.get(sym)
            best = a
            if b and (not a or b["date"] >= a["date"]):
                best = b
            if best:
                row.update(best); row["available"] = True
            else:
                failed.append(sym)
            rows.append(row)
        exp = expected_date(tz, close_hour)
        dates = [r["date"] for r in rows if r.get("date")]
        latest = max(dates) if dates else None
        stale = bool(latest) and latest < exp  # 数据早于应有交易日 => 可能休市
        out["markets"].append({"key": key, "name": name, "data_date": latest,
                               "expected_date": exp, "stale": stale, "items": rows})
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("已写入 data.json，更新时间", out["updated"])
    print("失败:", ", ".join(failed) if failed else "无")

if __name__ == "__main__":
    main()
