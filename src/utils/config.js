export function getApiBases() {
  const content = document.querySelector('meta[name="apiBase"]')?.content || location.origin
  const bases = content.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const url = new URL(s)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid apiBase origin')
    return url.origin
  })
  return [...new Set(bases)]
}
export function adminUrl(base) { return `${base}/admin#/admin` }
