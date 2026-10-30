export function createLiveSocket({ client, id = null, ids = [], timeoutMinutes = 0, onBatch, onState, Socket = WebSocket, timers = globalThis, random = Math.random }) {
  let socket, retryTimer, timeoutTimer, stableTimer, stopped = false, attempts = 0
  const closeSocket = () => {
    timers.clearTimeout(timeoutTimer); timers.clearTimeout(stableTimer)
    if (socket) { socket.onclose = socket.onmessage = socket.onerror = socket.onopen = null; socket.close(); socket = null }
  }
  const connect = () => {
    if (stopped) return
    onState('connecting')
    try {
      const active = socket = new Socket(client.wsUrl(id))
      active.onopen = () => {
        if (stopped) return
        onState('live')
        // Reset the retry budget only after a stable connection, never on a brief open/close loop.
        stableTimer = timers.setTimeout(() => { attempts = 0 }, 30000)
        if (!id) active.send(JSON.stringify({ type: 'subscribe', scope: 'all', ids: ids.slice(0, 500) }))
        if (timeoutMinutes > 0) timeoutTimer = timers.setTimeout(() => { stopped = true; closeSocket(); onState('timeout') }, timeoutMinutes * 60000)
      }
      active.onmessage = event => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'ping') active.send(JSON.stringify({ type: 'pong', ts: msg.ts }))
          if (msg.type === 'batchUpdate') onBatch(msg)
        } catch { onState('invalidMessage') }
      }
      active.onerror = () => active.close()
      active.onclose = event => {
        closeSocket()
        if (stopped) return
        if ([1008, 4001, 4401, 4403].includes(event.code)) { stopped = true; onState('authError'); return }
        retry()
      }
    } catch { retry() }
  }
  const retry = () => {
    if (stopped) return
    if (attempts >= 6) { stopped = true; onState('disconnected'); return }
    const delay = Math.min(30000, 1000 * 2 ** attempts++) + Math.floor(random() * 500)
    onState('retrying')
    retryTimer = timers.setTimeout(connect, delay)
  }
  connect()
  return { stop() { stopped = true; timers.clearTimeout(retryTimer); closeSocket() } }
}
