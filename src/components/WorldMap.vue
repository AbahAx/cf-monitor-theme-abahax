<script setup>
import { computed } from 'vue'
import { WORLD_OUTLINES } from '../utils/worldData.js'
import { online } from '../utils/model.js'
import { state } from '../composables/monitor.js'
import { t, english } from '../composables/i18n.js'
import Icon from './Icon.vue'
const props = defineProps({ servers: Array, region: String })
defineEmits(['select'])
const coordinates = { CN: [116.4, 39.9], HK: [114.17, 22.3], TW: [121.5, 25.04], MO: [113.55, 22.2], JP: [139.69, 35.69], KR: [126.98, 37.56], SG: [103.85, 1.29], MY: [101.69, 3.14], TH: [100.5, 13.75], VN: [105.85, 21.03], ID: [106.85, -6.2], PH: [120.98, 14.6], IN: [77.2, 28.61], AU: [151.2, -33.87], NZ: [174.76, -36.85], US: [-95.7, 37.1], CA: [-79.38, 43.65], MX: [-99.13, 19.43], GB: [-0.13, 51.5], DE: [8.68, 50.11], FR: [2.35, 48.86], NL: [4.9, 52.37], IE: [-6.26, 53.35], RU: [37.62, 55.75], IT: [9.19, 45.46], ES: [-3.7, 40.42], CH: [8.54, 47.38], SE: [18.07, 59.33], NO: [10.75, 59.91], FI: [24.94, 60.17], DK: [12.57, 55.68], PL: [21.01, 52.23], UA: [30.52, 50.45], AT: [16.37, 48.21], CZ: [14.44, 50.08], RO: [26.1, 44.43], BE: [4.35, 50.85], PT: [-9.14, 38.72], GR: [23.73, 37.98], HU: [19.04, 47.5], TR: [32.85, 39.93], AE: [55.27, 25.2], SA: [46.72, 24.71], IL: [34.78, 32.09], ZA: [28.05, -26.2], BR: [-46.63, -23.55], AR: [-58.38, -34.6], CL: [-70.67, -33.45], IS: [-21.94, 64.15], EE: [24.75, 59.44], LT: [25.28, 54.68], LV: [24.1, 56.95] }
const project = ([x, y]) => [((x + 180) / 360 * 800).toFixed(1), ((80 - Math.max(-80, Math.min(80, y))) / 160 * 400).toFixed(1)]
const land = WORLD_OUTLINES.map(ring => `M${ring.map(project).map(p => p.join(',')).join('L')}Z`).join(' ')
const regions = computed(() => {
  const map = new Map()
  for (const server of props.servers) {
    const code = String(server.region || '').toUpperCase()
    if (!code) continue
    const region = map.get(code) || { code, total: 0, online: 0, point: coordinates[code] ? project(coordinates[code]) : null, site: server._site, names: [] }
    region.total++; region.online += Number(online(server, state.now)); region.names.push(server.name); map.set(code, region)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})
function regionName(code) { try { return new Intl.DisplayNames([english.value ? 'en' : 'zh-CN'], { type: 'region' }).of(code) } catch { return code } }
</script>
<template>
  <section class="panel world-map">
    <div class="section-heading"><div><h2 class="row"><Icon name="globe" />{{ t('map') }}<span class="badge mono">FLAT MATRIX</span></h2><p class="small muted">{{ servers.length }} {{ t('nodes') }} · {{ regions.length }} {{ t('regions') }}</p></div><span class="small muted map-hint">{{ t('mapHint') }}</span></div>
    <div class="map-layout">
      <svg viewBox="0 0 800 400" class="map-svg" :aria-label="t('map')">
        <defs><pattern id="graticule" width="66.667" height="75" patternUnits="userSpaceOnUse"><path d="M66.667 0H0V75" fill="none" stroke="currentColor" stroke-width=".5" /></pattern></defs>
        <rect x="0" y="0" width="800" height="400" fill="url(#graticule)" class="graticule" />
        <path :d="land" class="land" />
        <path d="M0 200H800" class="equator" />
        <text x="8" y="15" class="map-label">180°W</text><text x="380" y="15" class="map-label">0° (UTC)</text><text x="752" y="15" class="map-label">180°E</text>
        <g v-for="r in regions.filter(r => r.point)" :key="r.code" role="button" tabindex="0" :aria-label="`${regionName(r.code)} ${r.online}/${r.total}`" :aria-pressed="region === r.code" class="beacon" :class="{ active: !region || region === r.code, down: !r.online }" @click="$emit('select', region === r.code ? null : r.code)" @keydown.enter="$emit('select', region === r.code ? null : r.code)" @keydown.space.prevent="$emit('select', region === r.code ? null : r.code)">
          <title>{{ regionName(r.code) }} · {{ r.online }}/{{ r.total }}&#10;{{ r.names.join('\n') }}</title>
          <circle :cx="r.point[0]" :cy="r.point[1]" :r="8 + Math.min(7, r.total)" class="beacon-halo" /><circle :cx="r.point[0]" :cy="r.point[1]" r="4" class="beacon-core" /><circle :cx="r.point[0]" :cy="r.point[1]" r="1.5" fill="white" />
        </g>
      </svg>
      <div class="region-list"><div class="spread small muted"><strong>{{ t('regions') }}</strong><span>{{ regions.length }}</span></div><button v-for="r in regions" :key="r.code" class="region-item" :class="{ selected: region === r.code }" :aria-pressed="region === r.code" @click="$emit('select', region === r.code ? null : r.code)"><span class="row"><img v-if="/^[A-Z]{2}$/.test(r.code)" class="flag" :src="`${state.sites[r.site].base}/flags/${r.code.toLowerCase()}.svg`" :alt="r.code" />{{ regionName(r.code) }} <small class="muted">({{ r.code }})</small><small v-if="!r.point" class="muted">{{ t('mapUnknown') }}</small></span><span class="mono" :class="{ 'text-green': r.online }">{{ r.online }}/{{ r.total }}</span><i :style="{ width: `${r.online / r.total * 100}%` }" /></button></div>
    </div>
  </section>
</template>
