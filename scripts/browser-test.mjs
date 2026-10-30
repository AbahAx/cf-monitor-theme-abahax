import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { chromium, expect } from '@playwright/test'
import { fixtures } from './fixtures.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = resolve(root, 'dist'), output = resolve(root, 'test-results')
mkdirSync(output, { recursive: true })
const { servers, rows } = fixtures()
let mode = { public: true, turnstile: false }, requests = [], subscriptions = [], openSockets = new Set(), multi = false, apiBase, fail403 = false, wsSeq = 0
const stats = { total: 6, online: 5, offline: 1, globalSpeedIn: 2621440, globalSpeedOut: 1310720, globalNetRx: 384 * 1024 ** 3, globalNetTx: 222 * 1024 ** 3 }
const sysConfig = { show_price: true, show_expire: true, show_tf: true, show_three_net_details: true }
const config = auth => ({ is_public: mode.public, authorization: auth, version: '2.8.6', turnstile_enabled: mode.turnstile, turnstile_site_key: 'test-site-key', preferred_theme: 'dark', default_language: 'zh', custom_ct_name: '电信', custom_cu_name: '联通', site_title: 'AbahAx · CF 探针', frontend_ws_timeout_minutes: mode.timeout || 0, theme_options: mode.options || {}, verified: false })
function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const origin = req.headers.origin
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true') }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Turnstile-Token,X-Turnstile-Verified'); res.end(); return }
  const auth = req.headers.authorization === 'Bearer good-jwt' || req.headers.cookie?.includes('cfsm_auth=good-jwt')
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
  if (url.pathname.startsWith('/api/')) {
    requests.push({ path: url.pathname, search: url.search, headers: req.headers, method: req.method })
    if (url.pathname === '/api/config') {
      if (req.headers['x-turnstile-token']) return json({ ...config(auth), verified: true, turnstile_verified: `verified-${req.headers.host}` })
      return json(config(auth))
    }
    if (!mode.public && !auth) return json({ error: 'Unauthorized' }, 401)
    if (mode.turnstile && (!req.headers['x-turnstile-verified'] || fail403)) { fail403 = false; return json({ error: 'Turnstile verification failed' }, 403) }
    if (url.pathname === '/api/servers') return json({ servers, stats, sysConfig })
    if (url.pathname === '/api/server') { const s = servers.find(s => s.id === url.searchParams.get('id')); return s ? json({ ...s, ping: undefined, loss: undefined, gpu_info: JSON.stringify(s.gpu_info), sysConfig }) : json({ error: 'Not found' }, 404) }
    if (url.pathname === '/api/history/all') return json(rows(url.searchParams.get('id')))
    if (url.pathname === '/api/theme_options' && req.method === 'POST' && auth) { let body = ''; req.on('data', c => body += c); req.on('end', () => { const data = JSON.parse(body); mode.options = data.theme_options; json({ success: true, theme_options: data.theme_options }) }); return }
    return json({ error: 'Unknown test endpoint' }, 404)
  }
  if (url.pathname === '/admin') { res.setHeader('Content-Type', 'text/html'); res.end('<h1>Built-in admin login fixture</h1>'); return }
  const staticFile = resolve(dist, '.' + decodeURIComponent(url.pathname))
  if (staticFile !== dist && !staticFile.startsWith(dist + sep)) { res.writeHead(403); res.end(); return }
  if (url.pathname.startsWith('/flags/') || url.pathname.startsWith('/os-icons/')) {
    const upstreamPublic = resolve(root, '../cf-server-monitor-upstream/public'), file = resolve(upstreamPublic, '.' + url.pathname)
    if (file.startsWith(upstreamPublic + sep) && existsSync(file)) { res.setHeader('Content-Type', extname(file) === '.svg' ? 'image/svg+xml' : 'image/webp'); res.end(readFileSync(file)); return }
    res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><rect width="24" height="16" fill="#fff"/><circle cx="12" cy="8" r="4" fill="#c33"/></svg>'); return
  }
  if (!existsSync(staticFile) || !statSync(staticFile).isFile()) {
    if (!['/', '/index.html'].includes(url.pathname)) { res.writeHead(404); res.end('Not found'); return }
    let html = readFileSync(resolve(dist, 'index.html'), 'utf8')
    if (multi) html = html.replace('</head>', `<meta name="apiBase" content="${apiBase}"></head>`).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    res.setHeader('Content-Type', 'text/html'); res.end(html); return
  }
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(staticFile)] || 'application/octet-stream')
  res.end(readFileSync(staticFile))
}
const server = http.createServer(handle), second = http.createServer(handle)
const wss = new WebSocketServer({ noServer: true })
for (const srv of [server, second]) srv.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  const authorized = mode.public || req.headers.cookie?.includes('cfsm_auth=good-jwt') || url.searchParams.get('token') === 'good-jwt'
  if (!authorized) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
})
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost'), scope = url.searchParams.get('subscribe'), seq = ++wsSeq
  openSockets.add(ws)
  subscriptions.push({ scope, ids: null, url: req.url, host: req.headers.host, seq })
  const log = subscriptions.at(-1)
  const timers = []
  function send() {
    for (let i = 0; i < 20; i++) timers.push(setTimeout(() => {
      if (ws.readyState !== 1) return
      ws.send(JSON.stringify({ type: 'batchUpdate', updates: [{ serverId: scope === 'all' ? 'jp-24' : scope, samples: [{ ts: Date.now(), [i % 3 === 0 ? 'metrics' : i % 3 === 1 ? 'payload' : 'data']: { cpu: 20 + i, ram_used: 1200 + i } }] }] }))
    }, 80 + i * 25))
  }
  ws.on('message', data => { const msg = JSON.parse(data); if (msg.type === 'subscribe') { log.ids = msg.ids; send() } })
  if (scope !== 'all') send()
  ws.on('close', () => { timers.forEach(clearTimeout); openSockets.delete(ws) })
})
server.listen(0, '127.0.0.1'); second.listen(0, '127.0.0.1'); await Promise.all([once(server, 'listening'), once(second, 'listening')])
const base = `http://127.0.0.1:${server.address().port}`, otherBase = `http://127.0.0.1:${second.address().port}`
const executablePath = process.env.BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined)
const browser = await chromium.launch({ executablePath, headless: true })
const results = []
const count = path => requests.filter(r => r.path === path).length
async function context(authed = false, viewport = { width: 1440, height: 1100 }) {
  const ctx = await browser.newContext({ viewport })
  if (authed) { await ctx.addCookies([{ name: 'cfsm_auth', value: 'good-jwt', url: base }]); await ctx.addInitScript(() => localStorage.setItem('jwt_token', 'good-jwt')) }
  await ctx.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({ contentType: 'text/javascript', body: `window.turnstile={render(el,opts){const b=document.createElement('button');b.textContent='Mock Turnstile verify';b.setAttribute('data-test-verify','true');b.onclick=()=>opts.callback('single-use-token');el.append(b);return 'widget';},remove(){}};` }))
  return ctx
}
async function verifyIfNeeded(page) { if (mode.turnstile) { await page.getByText('Mock Turnstile verify').click() } }
const pause = async page => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
const resume = async page => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')) })
try {
  for (const [isPublic, turnstile] of [[true, false], [true, true], [false, false], [false, true]]) {
    mode = { public: isPublic, turnstile }; requests = []; subscriptions = []
    const ctx = await context(!isPublic), page = await ctx.newPage(), errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto(base)
    await verifyIfNeeded(page)
    await expect(page.locator('.server-card')).toHaveCount(6)
    await expect.poll(() => subscriptions[0]?.ids).toEqual(servers.map(s => s.id))
    assert.equal(count('/api/config'), turnstile ? 2 : 1); assert.equal(count('/api/servers'), 1)
    assert.equal(await page.locator('.cost-row').count(), isPublic ? 0 : 6)
    assert.deepEqual(await page.locator('.server-card').evaluateAll(nodes => nodes.map(el => el.dataset.server)), servers.map(s => s.id))
    await page.evaluate(() => { window.cpuMutations = 0; const el = document.querySelector('[data-server="jp-24"] .meter strong'); new MutationObserver(() => window.cpuMutations++).observe(el, { subtree: true, childList: true, characterData: true }) })
    await expect(page.locator('[data-server="jp-24"] .meter').first()).toContainText('39%')
    assert.ok(await page.evaluate(() => window.cpuMutations) <= 2, 'homepage must batch renders to once per second')
    assert.equal(await page.locator('[data-server="jp-24"] .latency-row').count(), 2)
    await expect(page.locator('[data-server="jp-24"] .latency-row').first()).toContainText('0 ms')
    await expect(page.locator('[data-server="jp-24"] .latency-row').nth(1)).toContainText('超时')
    await page.locator('[data-server="jp-24"]').click()
    await expect(page.locator('.detail-title h1')).toContainText('日本JP')
    await expect.poll(() => count('/api/history/all')).toBe(1)
    assert.match(requests.find(r => r.path === '/api/history/all').search, /hours=0\.167/)
    await expect.poll(() => subscriptions.at(-1)?.scope).toBe('jp-24')
    assert.equal(count('/api/servers'), 1)
    await expect(page.locator('.chart-panel')).toHaveCount(7)
    await page.locator('.range-toolbar select').selectOption('0.5')
    await expect.poll(() => count('/api/history/all')).toBe(2)
    await pause(page); await expect.poll(() => openSockets.size).toBe(0)
    const detailReads = count('/api/server'); await resume(page)
    await expect.poll(() => count('/api/server')).toBe(detailReads + 1); assert.equal(count('/api/history/all'), 2)
    await page.getByRole('link', { name: '返回列表' }).click(); await expect(page.locator('.server-card')).toHaveCount(6)
    assert.equal(count('/api/servers'), 1); assert.equal(count('/api/config'), turnstile ? 2 : 1)
    await pause(page); await expect.poll(() => openSockets.size).toBe(0); await resume(page)
    await expect.poll(() => count('/api/servers')).toBe(2)
    if (turnstile) { assert.ok(requests.filter(r => r.path !== '/api/config').every(r => r.headers['x-turnstile-verified'])); assert.equal(count('/api/config'), 2) }
    else assert.ok(requests.every(r => !Object.keys(r.headers).some(k => k.startsWith('x-turnstile'))))
    if (!isPublic) {
      await page.getByRole('button', { name: '主题设置', exact: true }).click()
      await page.getByLabel('显示拓扑地图', { exact: true }).uncheck()
      await page.getByRole('button', { name: '保存到服务端' }).click()
      await expect(page.getByText('主题配置已保存')).toBeVisible(); assert.equal(count('/api/theme_options'), 1)
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await expect(page.locator('.world-map')).toHaveCount(0)
    }
    assert.deepEqual(errors, [])
    results.push({ case: `${isPublic ? 'public' : 'private'} + Turnstile ${turnstile ? 'on' : 'off'}`, passed: true })
    await ctx.close(); await expect.poll(() => openSockets.size).toBe(0)
  }
  mode = { public: false, turnstile: false }; requests = []
  let ctx = await context(), page = await ctx.newPage()
  await page.goto(base); await expect(page).toHaveURL(`${base}/admin#/admin`)
  assert.equal(count('/api/servers'), 0); results.push({ case: 'private anonymous redirects to built-in login', passed: true }); await ctx.close()

  mode = { public: true, turnstile: false }; requests = []; subscriptions = []
  ctx = await context(); page = await ctx.newPage()
  await page.goto(`${base}/#/server/jp-24`); await expect(page.locator('.detail-title')).toBeVisible()
  assert.equal(count('/api/servers'), 0); assert.equal(count('/api/server'), 1); assert.equal(count('/api/history/all'), 1)
  await expect.poll(() => subscriptions.at(-1)?.scope).toBe('jp-24'); results.push({ case: 'direct detail does not fetch list or subscribe all', passed: true }); await ctx.close()

  mode = { public: true, turnstile: true }; requests = []
  ctx = await context(); page = await ctx.newPage(); await page.goto(base); await verifyIfNeeded(page); await expect(page.locator('.server-card')).toHaveCount(6)
  await page.reload(); await expect(page.locator('.server-card')).toHaveCount(6); await expect(page.getByText('Mock Turnstile verify')).toHaveCount(0)
  fail403 = true; await pause(page); await resume(page); await expect(page.getByText('Mock Turnstile verify')).toBeVisible(); await verifyIfNeeded(page); await expect(page.getByText('Mock Turnstile verify')).toHaveCount(0)
  results.push({ case: 'Turnstile cached across reload and 403 prompts once without reload loop', passed: true }); await ctx.close()

  mode = { public: true, turnstile: false, timeout: 0.02 }; ctx = await context(); page = await ctx.newPage(); await page.goto(base)
  await expect(page.locator('.timeout-panel')).toBeVisible(); await expect.poll(() => openSockets.size).toBe(0)
  const attempts = wsSeq; await page.waitForTimeout(1400); assert.equal(wsSeq, attempts)
  await pause(page); await resume(page); await page.waitForTimeout(250); assert.equal(wsSeq, attempts)
  await page.locator('.timeout-panel').getByRole('button', { name: '继续连接' }).click(); await expect.poll(() => wsSeq).toBe(attempts + 1)
  results.push({ case: 'connection timeout stays paused across visibility changes until explicit continue', passed: true }); await ctx.close()

  mode = { public: false, turnstile: false }; multi = true; apiBase = `${base},${otherBase}`; requests = []; subscriptions = []
  ctx = await context(true); page = await ctx.newPage(); await page.goto(base); await expect(page.locator('.server-card')).toHaveCount(12)
  await expect.poll(() => subscriptions.filter(s => s.ids).length).toBe(2)
  assert.ok(subscriptions.every(s => s.ids.length === 6)); assert.ok(subscriptions.find(s => s.host === new URL(otherBase).host).url.includes('token=good-jwt'))
  await page.locator('.server-card').nth(6).click(); await expect.poll(() => subscriptions.at(-1)?.scope).toBe('jp-24'); assert.equal(subscriptions.at(-1).host, new URL(otherBase).host)
  results.push({ case: 'multi-site IDs, credential URL and duplicate-ID detail source are isolated', passed: true }); await ctx.close(); multi = false

  mode = { public: true, turnstile: false }; ctx = await context(); page = await ctx.newPage(); await page.goto(base); await expect(page.locator('.server-card')).toHaveCount(6); await page.waitForTimeout(1200)
  await page.screenshot({ path: resolve(output, 'desktop-dark.png'), fullPage: true })
  await page.getByRole('button', { name: '切换深浅色' }).click(); await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.screenshot({ path: resolve(output, 'desktop-light.png'), fullPage: true })
  await page.locator('.server-card').first().click(); await expect(page.locator('.history-chart')).toHaveCount(7); await page.screenshot({ path: resolve(output, 'detail-light.png'), fullPage: true })
  await ctx.close(); ctx = await context(false, { width: 390, height: 844 }); page = await ctx.newPage(); await page.goto(base); await expect(page.locator('.server-card')).toHaveCount(6)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile viewport overflows horizontally')
  await page.screenshot({ path: resolve(output, 'mobile-dark.png'), fullPage: true })
  await page.locator('[data-server="jp-24"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, 'mobile-cards.png') })
  await ctx.close()
  results.push({ case: 'desktop dark/light, detail and 390px mobile visual captures', passed: true })
  writeFileSync(resolve(output, 'browser-report.json'), JSON.stringify({ testedAt: new Date().toISOString(), backend: 'local protocol fixtures, not a deployed Worker', results }, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
  for (const ws of openSockets) ws.terminate()
  wss.close(); server.close(); second.close()
}
