import { computed, reactive } from 'vue'
import { getApiBases, adminUrl } from '../utils/config.js'
import { createClient } from '../utils/http.js'
import { fetchServers, fetchServer, fetchHistory, saveOptions } from '../utils/api.js'
import { normalizeServer, mergeSample, collectUpdates, applyUpdates, online, n } from '../utils/model.js'
import { createLiveSocket } from '../utils/socket.js'

const clients = getApiBases().map(base => createClient(base))
export const state = reactive({
  sites: clients.map((c, index) => ({ base: c.base, index, config: null, loaded: false, servers: [], stats: {}, sys: {}, details: {}, histories: {}, speed: [], status: 'idle', error: '', verification: false, paused: false })),
  initialized: false, busy: false, saving: false, hours: 0.167, now: Date.now(), route: { id: null, site: 0 }
})
let initialization, epoch = 0, controller, sockets = [], flushTimer, ageTimer
const pending = new Map(), lastFlush = new Map()
const activeSites = () => state.route.id ? [state.sites[state.route.site] || state.sites[0]] : state.sites
export const primary = computed(() => state.sites[0]?.config || {})
export const allServers = computed(() => state.sites.flatMap(site => site.servers.map(s => ({ ...s, _site: site.index, _config: site.config, _sys: site.sys }))))
export const activeDetail = computed(() => {
  const site = state.sites[state.route.site] || state.sites[0]
  const s = site.details[state.route.id]
  return s ? { ...s, _site: site.index, _config: site.config, _sys: s.sysConfig || site.sys } : null
})
export const activeHistory = computed(() => {
  const site = state.sites[state.route.site] || state.sites[0]
  return site.histories[`${state.route.id}:${state.hours}`] || []
})
export const options = computed(() => ({ show_summary: true, show_globe: true, show_latency: true, offline_placement: 'default', panel_opacity: 1, ping_lines: '', ...(primary.value.theme_options || {}) }))
export const totalStats = computed(() => {
  const result = {}
  for (const site of state.sites) for (const [key, value] of Object.entries(site.stats)) result[key] = n(result[key]) + n(value)
  return result
})
export const adminLinks = computed(() => state.sites.map(s => ({ base: s.base, url: adminUrl(s.base), index: s.index })))

function handleError(site, error) {
  if (error.name === 'AbortError') return
  site.error = error.message || String(error)
  if (error.status === 403) { site.verification = true; site.status = 'verification' }
  if (error.status === 401) site.status = 'authError'
}
export function initialize() {
  return initialization ||= Promise.allSettled(clients.map(async (client, i) => {
    const site = state.sites[i]
    try {
      site.config = await client.getConfig()
      if (site.config.is_public !== true && site.config.authorization !== true) {
        site.status = 'authError'
        location.assign(adminUrl(site.base))
        return
      }
      site.verification = site.config.turnstile_enabled === true && !client.hasVerified && site.config.verified !== true
    } catch (error) { handleError(site, error) }
  })).then(() => { state.initialized = true })
}
function stop() {
  epoch++
  controller?.abort()
  sockets.forEach(s => s.stop()); sockets = []
  clearTimeout(flushTimer); clearTimeout(ageTimer); flushTimer = ageTimer = null
  pending.clear()
}
function historyRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid history response')
  return rows.map(row => mergeSample({}, row, row.timestamp)).sort((a, b) => a.timestamp - b.timestamp)
}
function flush() {
  flushTimer = null
  if (document.hidden) { pending.clear(); return }
  const now = state.now = Date.now()
  for (const [index, updates] of pending) {
    const site = state.sites[index]
    if (!site) continue
    // At most one commit per site per second; merge all received deltas, not just the last payload.
    if (now - (lastFlush.get(index) || 0) < 1000) continue
    lastFlush.set(index, now)
    if (state.route.id) {
      const id = state.route.id, patch = updates.get(id), old = site.details[id]
      if (patch && old && n(patch.timestamp) >= n(old.timestamp)) {
        const detail = site.details[id] = mergeSample(old, patch, patch.timestamp)
        if (state.hours === 0.167) {
          const key = `${id}:${state.hours}`, rows = site.histories[key] || []
          const cutoff = now - state.hours * 3600000
          site.histories[key] = [...rows.filter(r => r.timestamp >= cutoff && r.timestamp !== patch.timestamp), { ...detail, timestamp: patch.timestamp }].slice(-600)
        }
      }
    } else {
      const updated = applyUpdates(site.servers, updates, site.stats, now)
      site.servers = updated.servers; site.stats = updated.stats
      site.speed = [...site.speed, { timestamp: now, in: n(site.stats.globalSpeedIn), out: n(site.stats.globalSpeedOut) }].slice(-60)
    }
    pending.delete(index)
  }
  if (pending.size) flushTimer = setTimeout(flush, 1000)
}
function queue(index, message) {
  const updates = collectUpdates(message, pending.get(index) || new Map())
  pending.set(index, updates)
  if (!flushTimer) flushTimer = setTimeout(flush, Math.max(0, 1000 - (Date.now() - (lastFlush.get(index) || 0))))
}
function scheduleAge() {
  ageTimer = setTimeout(() => {
    if (document.hidden) return
    const now = state.now = Date.now()
    for (const site of activeSites()) {
      if (state.route.id || !site.loaded) continue
      const updates = new Map(site.servers.filter(s => s._online !== online(s, now)).map(s => [s.id, { timestamp: n(s.last_updated || s.timestamp) }]))
      if (updates.size) {
        const next = applyUpdates(site.servers, updates, site.stats, now)
        site.servers = next.servers; site.stats = next.stats
      }
    }
    scheduleAge()
  }, 30000)
}
export async function loadPage({ id = null, site = 0 } = {}, refresh = false) {
  stop()
  if (id !== state.route.id) state.hours = 0.167
  state.route = { id, site: Math.max(0, Math.min(state.sites.length - 1, n(site))) }
  const run = epoch
  state.busy = true
  await initialize()
  if (run !== epoch) return
  if (document.hidden) { state.busy = false; return }
  controller = new AbortController()
  const signal = controller.signal
  await Promise.allSettled(activeSites().map(async current => {
    if (!current.config || current.verification || current.status === 'authError') return
    const client = clients[current.index]
    current.error = ''
    try {
      if (id) {
        const key = `${id}:${state.hours}`
        const tasks = []
        if (refresh || !current.details[id]) tasks.push(fetchServer(client, id, signal).then(data => {
          if (run === epoch) current.details[id] = normalizeServer(data)
        }))
        if (!Object.hasOwn(current.histories, key)) tasks.push(fetchHistory(client, id, state.hours, signal).then(data => {
          if (run === epoch) current.histories[key] = historyRows(data)
        }))
        await Promise.all(tasks)
      } else if (refresh || !current.loaded) {
        const data = await fetchServers(client, signal)
        if (run !== epoch) return
        if (!Array.isArray(data.servers) || !data.stats) throw new Error('Invalid server list response')
        current.servers = data.servers.map(normalizeServer)
        current.stats = data.stats; current.sys = data.sysConfig || {}; current.loaded = true
      }
      if (run !== epoch || document.hidden || current.paused) return
      const ids = id ? [] : current.servers.map(s => s.id)
      if (!id && ids.length > 500) throw new Error('This backend exceeds the 500-server subscription limit')
      const live = createLiveSocket({ client, id, ids, timeoutMinutes: n(current.config.frontend_ws_timeout_minutes), onBatch: msg => queue(current.index, msg), onState: status => {
        if (run !== epoch) return
        current.status = status
        if (status === 'timeout') current.paused = true
      } })
      sockets.push(live)
    } catch (error) { if (run === epoch) handleError(current, error) }
  }))
  if (run === epoch) { state.busy = false; scheduleAge() }
}
let historyEpoch = 0
export async function selectHours(hours) {
  const run = ++historyEpoch, { id, site } = state.route, current = state.sites[site]
  state.hours = Number(hours)
  const key = `${id}:${state.hours}`
  if (Object.hasOwn(current.histories, key)) return
  state.busy = true; current.error = ''
  try {
    const rows = await fetchHistory(clients[site], id, state.hours)
    if (state.route.id === id && state.route.site === site && run === historyEpoch) current.histories[key] = historyRows(rows)
  } catch (error) { handleError(current, error) }
  finally { if (run === historyEpoch) state.busy = false }
}
export async function verifySite(index, token) {
  const site = state.sites[index]
  site.error = ''
  try {
    site.config = await clients[index].verify(token)
    site.verification = false
    await loadPage(state.route)
  } catch (error) { handleError(site, error) }
}
export function resumeSite(index) { state.sites[index].paused = false; return loadPage(state.route, true) }
export async function retrySite(index) {
  const site = state.sites[index]
  if (!site.config) {
    site.error = ''
    try {
      site.config = await clients[index].getConfig()
      if (site.config.is_public !== true && site.config.authorization !== true) { site.status = 'authError'; location.assign(adminUrl(site.base)); return }
      site.verification = site.config.turnstile_enabled === true && !clients[index].hasVerified
    } catch (error) { handleError(site, error); return }
  }
  return loadPage(state.route, true)
}
export async function updateOptions(next) {
  state.saving = true
  try {
    // Each authorized backend stores its own settings; the primary site controls this combined view.
    const site = state.sites[0], result = await saveOptions(clients[0], { ...(site.config.theme_options || {}), ...next })
    site.config.theme_options = result.theme_options
  } finally { state.saving = false }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stop(); for (const site of state.sites) if (!site.paused) site.status = 'hidden' }
  else void loadPage(state.route, true)
})
