import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const version = JSON.parse(readFileSync(join(root, 'package.json'))).version
const dist = join(root, 'dist'), release = join(root, 'release')
if (readdirSync(dist).sort().join(',') !== 'assets,index.html') throw new Error('Theme output must contain exactly index.html and assets/')
mkdirSync(release, { recursive: true })
function files(directory, exclude = new Set()) {
  const result = {}
  const visit = path => {
    for (const name of readdirSync(path)) {
      if (exclude.has(name) || (name.startsWith('.env') && name !== '.env.example')) continue
      const file = join(path, name)
      if (statSync(file).isDirectory()) visit(file)
      else result[relative(directory, file).replaceAll('\\', '/')] = new Uint8Array(readFileSync(file))
    }
  }
  visit(directory)
  return result
}
for (const [suffix, entries] of [
  ['theme', files(dist)],
  ['source', files(root, new Set(['node_modules', 'release', 'dist', '.git', '.env', '.env.local', 'test-results']))]
]) {
  const filename = `cf-monitor-abahax-${version}-${suffix}.zip`
  const data = zipSync(entries, { level: 9 })
  writeFileSync(join(release, filename), data)
  writeFileSync(join(release, `${filename}.sha256`), `${createHash('sha256').update(data).digest('hex')}  ${filename}\n`)
  console.log(`${filename}: ${data.byteLength} bytes`)
}
