# AbahAx 极简主题 · CF Server Monitor 移植版

**CF 后台安装地址：[https://github.com/AbahAx/cf-monitor-theme-abahax/tree/dist](https://github.com/AbahAx/cf-monitor-theme-abahax/tree/dist)**。在内置后台 → 主题商店 → 自定义主题地址中填写此链接，预览后应用。无需下载 ZIP、配置 API 地址或开启 GitHub Pages。

从用户提供的 `1.0.5-abahax.3/theme.tar.gz` 移植，保留黑白极简样式、2px 微圆角、点阵背景、平面世界地图、汇总看板、分组筛选、节点卡片和历史详情。使用 Vue 3 + Vite 重新实现，适配 CF Server Monitor 的公开 API。

原版主题包 SHA-256：`a8dee8c86dc676169a13e7d531ebb638c1436d56a8d1f8be36c23897b0efd906`。

移植时核对的上游版本：`huilang-me/CF-Server-Monitor@5ddd42ca7153837f07656c9bdbe1b7bafbe2e02b`。技术约定以该提交的 [theme-ai-prompt.md](https://github.com/huilang-me/CF-Server-Monitor/blob/5ddd42ca7153837f07656c9bdbe1b7bafbe2e02b/theme-ai-prompt.md)、[theme-develop.md](https://github.com/huilang-me/CF-Server-Monitor/blob/5ddd42ca7153837f07656c9bdbe1b7bafbe2e02b/theme-develop.md) 及公开接口实现为依据。

## 使用现成主题包

**CF 后台只接受 GitHub 的主题目录链接，不接受上传 ZIP。** 下方 ZIP 是用于把文件传到 GitHub 的交付包。

`release/cf-monitor-abahax-1.0.0-theme.zip` 解压后根目录只有：

```text
index.html
assets/
```

CF 探针使用 GitHub 主题目录链接，不能直接导入原探针格式的 `theme.tar.gz`。

1. 在自己的公开 GitHub 仓库选择 `main` 分支，把主题 ZIP 解压后的 `index.html` 和 `assets/` 放到分支根目录并提交。上传解压后的文件，不要只上传 ZIP。也可以使用任意其他分支。
2. 打开 CF 探针内置后台 → 主题商店 → 自定义主题地址。
3. 填写 `https://github.com/你的用户名/你的仓库/tree/main`，先预览，再应用。使用其他分支时替换 `main`；也可用提交 SHA 锁定版本。

同域使用现成 ZIP 无需填写 Worker 地址。管理入口始终使用 `/admin#/admin`，由 CF 探针内置后台负责。

如果主题放在仓库子目录，链接要包含目录，例如 `https://github.com/你的用户名/你的仓库/tree/main/themes/abahax`。打开这个链接时应直接看到 `index.html` 和 `assets/`。GitHub 仓库首页、ZIP 下载链接、Release 页面或 `blob/.../index.html` 都不是安装地址。

也可使用 `release/cf-monitor-abahax-1.0.0-github.bundle`，它包含已提交好的 `main` 分支及编译产物，可在本地用 `git clone` 直接恢复，适合继续推送到空 GitHub 仓库。

```bash
git clone cf-monitor-abahax-1.0.0-github.bundle cf-monitor-abahax
cd cf-monitor-abahax
git remote set-url origin https://github.com/你的用户名/你的仓库.git
git push -u origin main
```

## 从源码构建

使用 Node.js 22 或更新版本：

```bash
npm ci
npm test
npm run build
```

产物在 `dist/`。`npm run package` 运行契约测试、构建，并生成主题 ZIP、源码 ZIP 和 SHA-256 校验文件。源码 ZIP 包含此说明、测试和 Actions 配置。

本地开发运行 `npm run dev`。后端不在同一 origin 时，复制 `.env.example` 为 `.env`，设置 `API_BASE`，并在 Worker 中允许本地 origin。

## GitHub Actions 与静态部署

把源码目录内容放在仓库根目录，工作流为 `.github/workflows/pages.yml`。推送 `main/master` 或手动运行时，自动追加构建提交到 `dist` 分支，保留源码提交说明和历史，不强制推送。**只用于 CF 主题商店安装时，不需要设置任何 Secret，也不需要开启 GitHub Pages**；工作流默认构建同源主题，完成后安装链接使用 `https://github.com/你的用户名/你的仓库/tree/dist`。

仅在独立 GitHub Pages 托管前端时，在仓库 Secrets 中配置：

| Secret | 用途 |
| --- | --- |
| `API_BASE` | 必填，一个或多个 Worker HTTPS origin，英文逗号分隔 |
| `TITLE` | 可选，静态页初始标题；站点配置载入后优先显示后台标题 |
| `BACKGROUND_IMAGE` | 可选，静态部署背景图片 URL |
| `CSP_API` | 可选，额外允许连接的 HTTPS/WSS origin，英文逗号分隔 |
| `CSP_STATIC` | 可选，额外允许的静态资源 HTTPS origin，英文逗号分隔 |

在 Settings → Actions → General 中开启工作流读写权限；工作流声明了 `contents: write`。在 Settings → Pages 中选择 `dist` 分支、`/ (root)` 作为托管源。

**跨域静态部署**：每个 Worker 的 `CORS_ALLOWED_ORIGINS` 都必须包含前端 origin，例如 `https://你的用户名.github.io`。只填 origin，不含路径或结尾斜杠。多站各自获取配置、列表和订阅自己的服务器 ID。不同源的私有站使用当前主题 origin 中的 `localStorage.jwt_token` 认证；浏览器不会把 Worker 域名上的 localStorage 自动共享到静态域名，因此私有站优先使用 Worker 同域主题。跨域 JWT 的取得与写入应由站点自己的可信认证流程完成，主题不实现自制登录。

## 功能与数据约定

- 默认沿用接口返回的后台顺序，分组和搜索不会改变默认排序。可切换 CPU/名称/到期排序，支持离线混排、置后或分区。
- 汇总数量初始使用 `/api/servers.stats`，后续按同一 5 分钟在线阈值维护增量变化。分组/地区筛选汇总同样使用该阈值。
- 费用只在服务端 `authorization === true` 且 `sysConfig.show_price === true` 时显示。按原币种分别汇总月费，不请求外汇接口；空价表示未设置，`0/-1` 表示免费。
- 主机内存和磁盘容量按 MB 读取，速率按 B/s 读取。数字流量限额按当前上游实现解释为 GB，并兼容 `1TB` 形式；支持 `dl/ul/max/total` 流量口径。
- 首页列表首次请求一次，路由往返复用缓存；仅页面由隐藏恢复或用户明确重试时补一次当前页面快照。详情默认 10 分钟历史，切换范围才按需加载其他历史；已经取得的范围复用缓存。
- 首页卡片延迟图仅使用列表窗口，不补查每台历史；后台关闭三网或窗口为空时隐藏。实时样本只在已存在窗口中续接点，不从空窗口自行造图。
- 增量样本支持 `data/payload/metrics`，缺失字段保留旧值。`false` 不画成 0，`null` 显示超时并断开曲线，`0` 正常显示。
- 所有数据刷新走 WebSocket，响应式数据最多每秒批量提交一次。隐藏页面关闭连接、取消重连及渲染计时器，恢复时按当前页面补快照。独立详情只订阅指定 ID；直接访问详情不会先查询列表。
- 重连指数退避：约 1/2/4/8/16/30 秒，加少量随机抖动，最多 6 次；稳定连接 30 秒后重置预算。连接时限到达后保留最后数据，必须点击“继续连接”才恢复，切换页面或隐藏恢复不会自动解除暂停。
- 磁盘 IO 仅取 `disk`；无有效对象时隐藏 IO 图。GPU 仅取 `gpu_info`，兼容 REST JSON 字符串和实时数组。
- 旗帜和 OS 图标使用对应 Worker 的 `/flags/`、`/os-icons/`，不打包进主题。
- 标题、默认语言、默认深浅色来自 `/api/config`。同域背景、自定义 head/脚本和 CSP 由 Worker 在 HTML 中注入，主题保留这些注入结果。

## 主题设置

登录后点击顶部设置图标，选项经 `POST /api/theme_options` 保存到服务端，不使用 localStorage 存主题配置。多站视图由第一个后端的主题设置控制，保存只更新第一个后端。

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `show_summary` | `true` | 汇总看板 |
| `show_globe` | `true` | 平面地图 |
| `show_latency` | `true` | 卡片延迟 |
| `ping_lines` | `""` | 线路键或自定义名称，留空显示前三项 |
| `offline_placement` | `"default"` | `default/bottom/separate` |
| `panel_opacity` | `1` | 面板不透明度，可选 0.15–1 |

背景图片请在内置后台外观设置配置。页面顶部的深浅色按钮只调整当前浏览会话；刷新后重新采用后台默认值。

## Turnstile 必要的配置验证交换

上游提示词同时要求“配置只查询一次”和“缓存验证响应中的 `turnstile_verified`”。经源码核对，当前只有带一次性令牌的 `/api/config` 会生成这个可复用凭证。因此本主题缓存首次配置，仅在用户完成人机验证时额外调用一次 `/api/config` 交换凭证；这不是路由重查或轮询。后续 API 使用 `X-Turnstile-Verified`，不同后端分别缓存，403 后清理相应缓存并重新提示验证。

Turnstile 未启用时不加载组件、不发送 Turnstile 头。401 清除 JWT 并跳转内置后台，不刷新主题页面；403 保留页面并提示验证，不循环刷新。

## 验证范围

```bash
npm test
npm run build
npm run test:browser
```

浏览器测试使用本地 HTTP/WebSocket 协议夹具和模拟 Turnstile 组件，覆盖公开/私有 × Turnstile 开/关、匿名跳转、凭证复用和 403、详情直达、可见性恢复、订阅时限、多源相同 ID、服务端保存、1 秒渲染节流。测试还输出桌面深色、桌面浅色、详情和手机截图至 `test-results/`。

Windows 默认使用系统 Edge；其他系统先运行 `npx playwright install chromium`。也可通过 `BROWSER_EXECUTABLE` 指定 Chromium 浏览器路径。

本次没有用户的线上 Worker 地址及登录环境，已完成本地协议联调与视觉检查，尚未在真实 Cloudflare/D1/Turnstile 服务上验收或发布。源码仓库工作流尚未推送运行。

## 来源与许可

原主题基于一眼DZ，原始许可证保留于 `LICENSE`；原预览保留于 `reference/preview.png`。世界地图沿用原主题的 Natural Earth 轮廓。OS 图标匹配规则适配自 CF Server Monitor，许可证保留于 `reference/CF-Server-Monitor-LICENSE`。运行依赖 Vue、Vue Router 和相应开源工具各自遵循其许可证。
