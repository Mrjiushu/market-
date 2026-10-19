# 全球股市日报（静态网站）

展示美股、港股、韩股、A股主要指数和 AI 主题个股（存储/大模型/光模块/AI芯片）的行情（**绿涨红跌**）。
交易时段内每 10 分钟左右自动更新，网页每 60 秒自动刷新；每个市场标注 交易中 / 午间休市 / 已收盘 / 休市。

## 文件说明
| 文件 | 作用 |
|---|---|
| `index.html` `style.css` `app.js` | 网页本身 |
| `data.json` | 行情数据（由脚本自动生成） |
| `update_data.py` | 抓取行情（yfinance + 新浪财经备用） |
| `requirements.txt` | Python 依赖 |
| `.github/workflows/update.yml` | GitHub 自动更新 + 发布网站的配置 |

## 一、在自己电脑上看（可选）
```bash
pip install -r requirements.txt
python update_data.py          # 抓最新数据
python -m http.server 8000     # 然后浏览器打开 http://localhost:8000
```

## 二、免费上线，让所有人都能打开（一步步来）
全程免费，大约 15 分钟。

1. **注册 GitHub**：打开 https://github.com ，点 Sign up，用邮箱注册并验证。记住你的用户名（下面叫 `你的用户名`）。
2. **新建仓库**：登录后点右上角 **+ → New repository**。
   - Repository name 填一个名字，比如 `market`
   - 选 **Public**（公开，免费用 Pages 必须公开）
   - 点 **Create repository**
3. **上传文件**：在新仓库页面点 **uploading an existing file**，把压缩包 `market-dashboard.zip` 解压后的**所有文件和文件夹**拖进去（注意 `.github` 文件夹也要上传，它是隐藏文件夹；如果拖不进去，看下面"会用命令行"的方法），点 **Commit changes**。
4. **给自动任务写权限**：仓库里点 **Settings → Actions → General**，拉到最下面 **Workflow permissions**，选 **Read and write permissions**，点 **Save**。
5. **开启网站（Pages）**：**Settings → Pages**，在 **Build and deployment → Source** 选 **GitHub Actions**。
6. **跑第一次**：点仓库顶部 **Actions** 标签 →（如有提示点绿色按钮启用）→ 左边选 "更新行情并发布网站" → 右边 **Run workflow**。等 1~2 分钟变成绿色对勾。
7. **打开网址**：`https://你的用户名.github.io/market/`（`market` 换成你的仓库名）。把这个网址发给别人就能看了。

之后什么都不用管，工作日交易时段会自动更新。

### 会用命令行的话（第 3 步的替代）
```bash
cd market-dashboard
git init -b main          # 已初始化过可跳过
git add . && git commit -m "初始版本"
git remote add origin https://github.com/你的用户名/market.git
git push -u origin main
```

## 三、自动更新时间表
定时任务只在**周一到周五**运行：

| GitHub cron（UTC） | 北京时间 | 覆盖市场 |
|---|---|---|
| `*/10 0-8 * * 1-5` | 08:00–16:59 每 10 分钟 | 韩股、A股、港股 |
| `*/10 13-20 * * 1-5` | 21:00–次日 04:59 每 10 分钟 | 美股（夏令时和冬令时都覆盖） |
| `30 21 * * 1-5` | 次日 05:30 | 美股收盘后抓最终收盘价 |

注意：
- **GitHub 的定时任务经常延迟**几分钟到几十分钟，高峰时偶尔会跳过一次，这是免费服务的正常现象；行情数据本身也有约 15 分钟延迟，网页上会标注"盘中 · 延迟行情"。
- 数据没变化时不会提交，不会刷屏。
- 公开仓库的 GitHub Actions 和 Pages 都免费。如果仓库 60 天没有任何改动，GitHub 可能自动暂停定时任务，到 Actions 页面点一下重新启用即可。
- 想用自己的域名（比如 `xxx.com`）需要另外买域名，可在 Settings → Pages → Custom domain 设置。

> 数据仅供参考，不构成投资建议。
