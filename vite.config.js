import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
function origins(value, ws = false) {
  return [...new Set(String(value || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const url = new URL(s)
    if (!['https:', ...(ws ? ['wss:'] : [])].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Runtime URLs must be HTTPS origins')
    return url.origin
  }))]
}
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const bases = origins(env.API_BASE)
  if (mode === 'github-page' && !bases.length) throw new Error('GitHub Pages build requires API_BASE in repository Secrets or .env')
  return {
    base: './',
    plugins: [vue(), {
      name: 'cfsm-runtime-config',
      generateBundle() {
        const license = ['LICENSE', 'reference/CF-Server-Monitor-LICENSE', 'node_modules/vue/LICENSE', 'node_modules/vue-router/LICENSE'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n\n')
        this.emitFile({ type: 'asset', fileName: 'assets/LICENSES.txt', source: license })
      },
      transformIndexHtml(html) {
        const extraApi = origins(env.CSP_API, true)
        const extraStatic = origins(env.CSP_STATIC)
        const connect = [...bases, ...extraApi].flatMap(x => [x, x.replace('https:', 'wss:')])
        const csp = `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com ${extraStatic.join(' ')}; style-src 'self' 'unsafe-inline' ${extraStatic.join(' ')}; img-src 'self' data: https:; font-src 'self' data: ${extraStatic.join(' ')}; connect-src 'self' https://challenges.cloudflare.com ${connect.join(' ')}; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'`
        const tags = [`<meta http-equiv="Content-Security-Policy" content="${escape(csp)}">`]
        if (bases.length) tags.push(`<meta name="apiBase" content="${escape(bases.join(','))}">`)
        if (env.TITLE) html = html.replace(/<title>.*?<\/title>/, `<title>${escape(env.TITLE)}</title>`)
        if (env.BACKGROUND_IMAGE) {
          const bg = new URL(env.BACKGROUND_IMAGE)
          if (!['https:', 'http:'].includes(bg.protocol)) throw new Error('Invalid BACKGROUND_IMAGE')
          tags.push(`<meta name="backgroundImage" content="${escape(bg.href)}">`)
        }
        return html.replace(/(<meta charset="UTF-8"\s*\/?>)/i, `$1\n${tags.join('\n')}`)
      }
    }],
    build: { assetsDir: 'assets', sourcemap: false }
  }
})
