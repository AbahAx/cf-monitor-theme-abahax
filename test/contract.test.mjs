import test from 'node:test'
import assert from 'node:assert/strict'
import { collectUpdates, applyUpdates, normalizeServer, latency, gpu, diskIo, trafficUsed, trafficLimit, price, costs, online } from '../src/utils/model.js'
import { createClient, ApiError } from '../src/utils/http.js'
import { fetchHistory, saveOptions } from '../src/utils/api.js'
import { createLiveSocket } from '../src/utils/socket.js'

const now = 1793328000000
test('incremental reports preserve report-level fields and use all payload aliases', () => {
  const original = normalizeServer({ id: 'a', timestamp: now, last_updated: now, cpu: 1, ram_total: 1024, disk_total: 100, disk: { read_bps: 20 }, gpu_info: '[{"id":"0","name":"GPU","info":12}]', ping: [{ ts: now, ct: 0 }], ping_ct: null, loss_ct: 0 })
  const updates = collectUpdates({ type: 'batchUpdate', updates: [{ serverId: 'a', samples: [
    { ts: now + 1, data: { cpu: 10, processes: 123 } }, { ts: now + 2, payload: { ram_used: 512 } }, { ts: now + 3, metrics: { cpu: 30 } }
  ] }] })
  const result = applyUpdates([original], updates, { total: 1, online: 1, offline: 0 }, now + 10).servers[0]
  assert.equal(result.cpu, 30); assert.equal(result.processes, 123); assert.equal(result.ram_total, 1024); assert.equal(result.ram_used, 512)
  assert.equal(result.disk_total, 100); assert.equal(result.disk.read_bps, 20); assert.equal(result.gpu_info[0].name, 'GPU')
  assert.equal(result.ping_ct, null); assert.equal(result.loss_ct, 0)
  collectUpdates({ type: 'batchUpdate', updates: [{ serverId: 'a', samples: [{ ts: now + 1, data: { cpu: 99 } }] }] }, updates)
  assert.equal(updates.get('a').cpu, 30)
})
test('false/null/zero are distinct and invalid GPU / disk data remain optional', () => {
  assert.equal(latency(false), null); assert.equal(latency(undefined), null); assert.equal(latency(null), '超时'); assert.equal(latency(0), '0 ms'); assert.equal(latency(0, '%'), '0 %')
  assert.deepEqual(gpu('garbage'), []); assert.deepEqual(gpu('[{"id":"1","info":0}]'), [{ id: '1', info: 0 }])
  assert.equal(diskIo(undefined), null); assert.equal(diskIo({ read_bps: 0 }), null); assert.equal(diskIo({ read_bps: 12 }).read_bps, 12)
})
test('online threshold, authoritative counters and numeric traffic limit semantics', () => {
  assert.equal(online({ last_updated: now - 299999 }, now), true); assert.equal(online({ last_updated: now - 300000 }, now), false)
  const old = { ...normalizeServer({ id: 'a', timestamp: now - 400000, last_updated: now - 400000, net_in_speed: 2, net_rx: 10 }), _online: false }
  const result = applyUpdates([old], new Map([['a', { timestamp: now, net_in_speed: 20, net_rx: 15 }]]), { total: 10, online: 8, offline: 2, globalSpeedIn: 100, globalNetRx: 1000 }, now)
  assert.equal(result.stats.total, 10); assert.equal(result.stats.online, 9); assert.equal(result.stats.offline, 1); assert.equal(result.stats.globalSpeedIn, 120); assert.equal(result.stats.globalNetRx, 1005)
  assert.equal(trafficLimit('1024'), 1024 ** 4); assert.equal(trafficLimit('1TB'), 1024 ** 4)
  const server = { net_rx_monthly: 10, net_tx_monthly: 3 }
  assert.equal(trafficUsed({ ...server, traffic_calc_type: 'dl' }), 10); assert.equal(trafficUsed({ ...server, traffic_calc_type: 'ul' }), 3); assert.equal(trafficUsed({ ...server, traffic_calc_type: 'max' }), 10)
  assert.equal(price(''), null); assert.equal(price('0'), 0); assert.equal(price('-1'), 0)
  assert.deepEqual(costs([{ price: '12', billing_cycle: 'year', currency: '$' }, { price: '2', billing_cycle: 'month', currency: '¥' }]), ['$ 1.00', '¥ 2.00'])
})
function storage() { const map = new Map(); return { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) } }
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
test('bootstrap is deduplicated; disabled Turnstile sends no Turnstile headers; JWT and socket origin handling', async () => {
  const local = storage(), calls = [], redirects = []
  local.setItem('jwt_token', 'jwt'); local.setItem('turnstile_verified', 'stale')
  const client = createClient('https://site.test', { storage: local, origin: 'https://site.test', navigate: u => redirects.push(u), request: async (url, init) => { calls.push({ url, init }); return response({ is_public: true, turnstile_enabled: false }) } })
  await Promise.all([client.getConfig(), client.getConfig()]); await client.getConfig(); await client.send('/api/servers')
  assert.equal(calls.filter(c => c.url.endsWith('/api/config')).length, 1)
  assert.equal(calls[1].init.headers.Authorization, 'Bearer jwt'); assert.equal(Object.keys(calls[1].init.headers).some(k => k.startsWith('X-Turnstile')), false)
  assert.equal(new URL(client.wsUrl('server 1')).searchParams.get('subscribe'), 'server 1'); assert.equal(new URL(client.wsUrl()).searchParams.has('token'), false)
  const remote = createClient('https://remote.test', { storage: local, origin: 'https://site.test', request: async () => response({}) })
  assert.equal(new URL(remote.wsUrl()).searchParams.get('token'), 'jwt')
})
test('Turnstile exchanges once and reuses scoped credential; 403 clears it without reload', async () => {
  const local = storage(), calls = []; let deny = false
  const client = createClient('https://remote.test', { storage: local, origin: 'https://theme.test', request: async (url, init) => {
    calls.push({ url, init }); if (deny) return response({ error: 'expired' }, 403)
    return response({ is_public: true, turnstile_enabled: true, verified: Boolean(init.headers['X-Turnstile-Token']), turnstile_verified: init.headers['X-Turnstile-Token'] ? 'encrypted' : null })
  } })
  await client.getConfig(); await Promise.all([client.verify('single-use'), client.verify('single-use')]); await client.send('/api/servers')
  assert.equal(calls.length, 3); assert.equal(calls[1].init.headers['X-Turnstile-Token'], 'single-use'); assert.equal(calls[2].init.headers['X-Turnstile-Verified'], 'encrypted'); assert.equal(calls[2].init.headers['X-Turnstile-Token'], undefined)
  assert.equal(local.getItem('turnstile_verified'), null)
  deny = true; await assert.rejects(client.send('/api/servers'), e => e.status === 403); assert.equal(client.hasVerified, false)
})
test('401 clears JWT and redirects to the built-in login; history range and settings use only documented endpoints', async () => {
  const local = storage(), redirects = []; local.setItem('jwt_token', 'bad')
  const client = createClient('https://site.test', { storage: local, origin: 'https://site.test', navigate: url => redirects.push(url), request: async () => response({ error: 'Unauthorized' }, 401) })
  await assert.rejects(client.send('/api/servers'), ApiError); assert.equal(local.getItem('jwt_token'), null); assert.deepEqual(redirects, ['https://site.test/admin#/admin'])
  const calls = [], mock = { send: (...args) => { calls.push(args); return Promise.resolve([]) } }
  assert.throws(() => fetchHistory(mock, 'a', 1000), /Unsupported/)
  await fetchHistory(mock, 'a&b', .167); await saveOptions(mock, { show_globe: false })
  assert.equal(calls[0][0], '/api/history/all?id=a%26b&hours=0.167'); assert.deepEqual(calls[1], ['/api/theme_options', { body: { theme_options: { show_globe: false } } }])
})
class FakeSocket {
  static sockets = []
  constructor(url) { this.url = url; this.sent = []; FakeSocket.sockets.push(this) }
  send(value) { this.sent.push(JSON.parse(value)) }
  close() { this.closed = true }
}
function clock() {
  let id = 0; const jobs = new Map()
  return { jobs, setTimeout(fn, ms) { const handle = ++id; jobs.set(handle, { fn, ms }); return handle }, clearTimeout(handle) { jobs.delete(handle) }, run(ms) { const entry = [...jobs].find(([, job]) => job.ms === ms); assert.ok(entry, `missing ${ms}ms timer`); jobs.delete(entry[0]); entry[1].fn() } }
}
test('WS sends only local IDs; timeout requires explicit resume; stopping cancels retries', () => {
  const timers = clock(), statuses = [], client = { wsUrl: id => `wss://site.test/api/ws?subscribe=${id || 'all'}` }
  const live = createLiveSocket({ client, ids: ['local'], timeoutMinutes: 1, Socket: FakeSocket, timers, onState: s => statuses.push(s), onBatch: () => {} })
  const socket = FakeSocket.sockets.at(-1); socket.onopen()
  assert.deepEqual(socket.sent, [{ type: 'subscribe', scope: 'all', ids: ['local'] }])
  timers.run(60000); assert.equal(statuses.at(-1), 'timeout'); assert.equal(socket.closed, true); assert.equal(timers.jobs.size, 0)
  live.stop()
  const second = createLiveSocket({ client, id: 'only-one', Socket: FakeSocket, timers, onState: () => {}, onBatch: () => {} })
  const single = FakeSocket.sockets.at(-1); single.onopen(); assert.equal(single.sent.length, 0); assert.match(single.url, /subscribe=only-one$/)
  single.onclose({ code: 1006 }); assert.ok(timers.jobs.size); second.stop(); assert.equal(timers.jobs.size, 0)
})
test('WS reconnect doubles delays, caps them and stops after six failures', () => {
  const timers = clock(), statuses = []
  createLiveSocket({ client: { wsUrl: () => 'wss://site.test' }, Socket: FakeSocket, timers, random: () => 0, onState: s => statuses.push(s), onBatch: () => {} })
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000]) { FakeSocket.sockets.at(-1).onclose({ code: 1006 }); timers.run(delay) }
  FakeSocket.sockets.at(-1).onclose({ code: 1006 }); assert.equal(statuses.at(-1), 'disconnected'); assert.equal(timers.jobs.size, 0)
})
