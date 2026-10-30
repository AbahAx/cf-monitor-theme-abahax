export const HOURS = [0.167, 0.5, 1, 6, 12, 24, 48, 96, 168]
export const PROBES = ['ct', 'cu', 'cm', 'bd', 'node_1', 'node_2', 'node_3', 'node_4']
const FIELDS = new Set(('name server_group tags price billing_cycle auto_renewal currency expire_date traffic_limit traffic_calc_type reset_day report_interval wss_report_interval is_hidden sort_order cpu load_avg net_in_speed net_out_speed net_rx net_tx net_rx_monthly net_tx_monthly processes tcp_conn udp_conn ram_total ram_used swap_total swap_used disk_total disk_used cpu_cores cpu_info gpu_info arch os kernel_version region ip_v4 ip_v6 boot_time agent_version last_updated timestamp is_online disk ' + PROBES.flatMap(k => [`ping_${k}`, `loss_${k}`]).join(' ')).split(' '))
export const numeric = value => typeof value === 'number' && Number.isFinite(value)
export const n = value => Number.isFinite(Number(value)) ? Number(value) : 0
export const online = (s, now = Date.now()) => n(s.last_updated || s.timestamp) > 0 && now - n(s.last_updated || s.timestamp) < 300000
export const percent = (used, total) => n(total) > 0 ? Math.max(0, Math.min(100, n(used) / n(total) * 100)) : 0
export function gpu(value) {
  try { const data = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(data) ? data.filter(x => x && typeof x === 'object') : [] } catch { return [] }
}
export function diskIo(value) {
  if (!value || typeof value !== 'object') return null
  const fields = ['read_bps', 'write_bps', 'read_iops', 'write_iops', 'await_ms', 'util']
  return fields.some(k => n(value[k]) > 0) ? Object.fromEntries(fields.map(k => [k, Math.max(0, n(value[k]))])) : null
}
export function mergeSample(previous, payload, ts) {
  const next = { ...previous }
  if (!payload || typeof payload !== 'object') return next
  for (const [key, value] of Object.entries(payload)) {
    if (!FIELDS.has(key) || value === undefined) continue
    next[key] = key === 'gpu_info' ? gpu(value) : key === 'disk' ? diskIo(value) : value
  }
  if (numeric(ts)) next.timestamp = next.last_updated = ts
  return next
}
export function collectUpdates(message, pending = new Map()) {
  if (message?.type !== 'batchUpdate' || !Array.isArray(message.updates)) return pending
  for (const update of message.updates) {
    if (!update || typeof update.serverId !== 'string') continue
    const samples = [...(Array.isArray(update.samples) ? update.samples : [])].filter(s => s && numeric(s.ts)).sort((a, b) => a.ts - b.ts)
    for (const sample of samples) {
      const old = pending.get(update.serverId)
      if (old && sample.ts < old.timestamp) continue
      pending.set(update.serverId, mergeSample(old || {}, sample.data || sample.payload || sample.metrics || {}, sample.ts))
    }
  }
  return pending
}
export function normalizeServer(value) {
  return { ...value, id: String(value.id), _online: online(value), gpu_info: gpu(value.gpu_info), disk: diskIo(value.disk), ping: Array.isArray(value.ping) ? value.ping : [], loss: Array.isArray(value.loss) ? value.loss : [] }
}
export function applyUpdates(servers, pending, stats, now = Date.now()) {
  const nextStats = { ...stats }
  const next = servers.map(server => {
    const patch = pending.get(server.id)
    if (!patch || n(patch.timestamp) < n(server.timestamp)) return server
    const merged = mergeSample(server, patch, patch.timestamp)
    const was = server._online ?? online(server, now), is = online(merged, now)
    merged._online = is
    if (stats) {
      nextStats.online = n(nextStats.online) + Number(is) - Number(was)
      nextStats.offline = n(nextStats.offline) - Number(is) + Number(was)
      for (const [out, field] of [['globalSpeedIn', 'net_in_speed'], ['globalSpeedOut', 'net_out_speed']]) nextStats[out] = n(nextStats[out]) + (is ? n(merged[field]) : 0) - (was ? n(server[field]) : 0)
      for (const [out, field] of [['globalNetRx', 'net_rx'], ['globalNetTx', 'net_tx']]) nextStats[out] = n(nextStats[out]) + n(merged[field]) - n(server[field])
    }
    // Preserve the actual list window. New report samples extend it without querying history.
    if (Object.keys(patch).some(k => k.startsWith('ping_'))) {
      const append = type => [...server[type], { ts: patch.timestamp, ...Object.fromEntries(PROBES.filter(k => Object.hasOwn(patch, `${type}_${k}`)).map(k => [k, patch[`${type}_${k}`]])) }].slice(-20)
      if (server.ping.length) merged.ping = append('ping')
      if (server.loss.length) merged.loss = append('loss')
    }
    return merged
  })
  return { servers: next, stats: nextStats }
}
export function latency(value, suffix = 'ms', timeout = '超时') {
  if (value === false || value === undefined || value === 'false') return null
  if (value === null) return timeout
  return numeric(value) ? `${Number(value.toFixed(1))} ${suffix}` : null
}
export function trafficLimit(value) {
  // The current admin stores a plain numeric GB limit; older/exported APIs may send "1TB".
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value ?? '').trim())) return Math.max(0, n(value)) * 1024 ** 3
  const match = String(value ?? '').trim().match(/^([\d.]+)\s*([kmgtpe]?)i?b?$/i)
  return match ? n(match[1]) * 1024 ** Math.max(0, ' kmgtpe'.indexOf(match[2].toLowerCase())) : 0
}
export function trafficUsed(s) {
  const incoming = n(s.net_rx_monthly), outgoing = n(s.net_tx_monthly)
  return ['dl', 'in'].includes(s.traffic_calc_type) ? incoming : ['ul', 'out'].includes(s.traffic_calc_type) ? outgoing : s.traffic_calc_type === 'max' ? Math.max(incoming, outgoing) : incoming + outgoing
}
export function daysLeft(value, now = Date.now()) {
  if (!value || String(value).startsWith('0000')) return null
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? Math.ceil((ts - now) / 86400000) : null
}
export function price(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? Math.max(0, num) : null
}
export function monthlyPrice(s) {
  const months = { month: 1, quarter: 3, half_year: 6, year: 12, two_years: 24, three_years: 36, four_years: 48, five_years: 60 }
  return months[s.billing_cycle] ? price(s.price) / months[s.billing_cycle] : null
}
export function costs(servers) {
  const totals = new Map()
  for (const s of servers) {
    if (price(s.price) === null) continue
    const monthly = monthlyPrice(s)
    if (monthly !== null) totals.set(s.currency || '¥', (totals.get(s.currency || '¥') || 0) + monthly)
  }
  return [...totals].map(([currency, value]) => `${currency} ${value.toFixed(2)}`)
}
export function bytes(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  const num = Math.max(0, Number(value)), index = Math.min(5, Math.max(0, Math.floor(Math.log2(num || 1) / 10)))
  return `${(num / 1024 ** index).toFixed(index ? digits : 0)} ${['B', 'KB', 'MB', 'GB', 'TB', 'PB'][index]}`
}
export const rate = value => `${bytes(value)}/s`
export const mb = value => bytes(value === undefined || value === null ? undefined : n(value) * 1048576)
export function duration(ms, english = false) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const minutes = Math.floor(ms / 60000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24)
  return days ? `${days}${english ? 'd' : '天'} ${hours % 24}${english ? 'h' : '小时'}` : hours ? `${hours}${english ? 'h' : '小时'} ${minutes % 60}${english ? 'm' : '分'}` : `${minutes}${english ? 'm' : '分'}`
}
