export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
// Per-backend credential scope prevents a multi-site installation from reusing another site's token.
export function createClient(base, { storage = localStorage, request = fetch, navigate = url => location.assign(url), origin = location.origin } = {}) {
  let configPromise, config, verifying
  const key = `cfsm_turnstile_verified:${base}`
  const verified = () => storage.getItem(key) || (base === origin ? storage.getItem('turnstile_verified') : '')
  const clear = () => { storage.removeItem(key); if (base === origin) storage.removeItem('turnstile_verified') }
  const client = {
    base,
    get config() { return config },
    get hasVerified() { return Boolean(verified()) },
    clearVerified: clear,
    async send(path, { body, signal, bootstrap = false, token } = {}) {
      const headers = {}, jwt = storage.getItem('jwt_token')
      if (jwt) headers.Authorization = `Bearer ${jwt}`
      if (!bootstrap && config?.turnstile_enabled === true) {
        if (token) headers['X-Turnstile-Token'] = token
        else if (verified()) headers['X-Turnstile-Verified'] = verified()
      }
      if (body) headers['Content-Type'] = 'application/json'
      const response = await request(`${base}${path}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, credentials: 'include', signal: signal || AbortSignal.timeout(20000) })
      let data
      try { data = await response.json() } catch { throw new ApiError(response.status, 'Invalid API response') }
      if (response.status === 401) { storage.removeItem('jwt_token'); navigate(`${base}/admin#/admin`) }
      if (response.status === 403) clear()
      if (!response.ok) throw new ApiError(response.status, data.error || data.message || `HTTP ${response.status}`)
      if (data?.turnstile_verified) {
        storage.setItem(key, data.turnstile_verified)
        if (base === origin) storage.setItem('turnstile_verified', data.turnstile_verified)
      }
      return data
    },
    getConfig() {
      return configPromise ||= client.send('/api/config', { bootstrap: true }).then(data => (config = data)).catch(error => { configPromise = null; throw error })
    },
    verify(token) {
      // Required by the backend: only /api/config returns the encrypted reusable credential.
      // This is a verification exchange, never a route-mount/config polling request.
      return verifying ||= client.send('/api/config', { token }).then(data => {
        if (!data.verified || !data.turnstile_verified) throw new ApiError(403, 'Verification did not return a reusable credential')
        config = data
        return data
      }).finally(() => { verifying = null })
    },
    wsUrl(id = null) {
      const url = new URL('/api/ws', base)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set('subscribe', id || 'all')
      const jwt = storage.getItem('jwt_token')
      if (base !== origin && jwt) url.searchParams.set('token', jwt)
      return url.href
    }
  }
  return client
}
