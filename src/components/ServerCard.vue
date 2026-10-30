<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import Meter from './Meter.vue'
import Sparkline from './Sparkline.vue'
import { state, options } from '../composables/monitor.js'
import { t, english, probeName } from '../composables/i18n.js'
import { n, online, percent, bytes, mb, rate, duration, trafficLimit, trafficUsed, daysLeft, price, latency, PROBES } from '../utils/model.js'
import { getOSImage } from '../utils/osIcon.js'
const props = defineProps({ server: Object })
const up = computed(() => online(props.server, state.now))
const limit = computed(() => trafficLimit(props.server.traffic_limit))
const days = computed(() => daysLeft(props.server.expire_date, state.now))
const canPrice = computed(() => props.server._config?.authorization === true && props.server._sys?.show_price === true)
const visibleProbes = computed(() => {
  const s = props.server
  if (options.value.show_latency === false || s._sys?.show_three_net_details !== true || !s.ping?.length) return []
  const all = PROBES.filter(k => s[`ping_${k}`] !== false && s[`ping_${k}`] !== 'false' && s.ping.some(point => latency(point[k]) !== null))
  const chosen = String(options.value.ping_lines || '').split(/[,;\n，；]/).map(v => v.trim()).filter(Boolean)
  return (chosen.length ? all.filter(k => chosen.includes(k) || chosen.includes(probeName(s._config, k))) : all).slice(0, 3)
})
function last(points, key) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i][key] !== undefined) return points[i][key]
  return false
}
function current(type, key) { return Object.hasOwn(props.server, `${type}_${key}`) ? props.server[`${type}_${key}`] : last(props.server[type] || [], key) }
const destination = computed(() => ({ path: `/server/${encodeURIComponent(props.server.id)}`, query: state.sites.length > 1 ? { site: props.server._site } : {} }))
</script>
<template>
  <RouterLink :to="destination" class="panel server-card" :data-server="server.id">
    <div class="spread card-heading">
      <div class="shrinkable">
        <h3 class="row"><img v-if="/^[A-Za-z]{2}$/.test(server.region || '')" class="flag" :src="`${state.sites[server._site].base}/flags/${server.region.toLowerCase()}.svg`" :alt="server.region" /><span class="ellipsis" :title="server.name">{{ server.name }}</span></h3>
        <p class="row muted small system-row"><img v-if="server.os" :src="`${state.sites[server._site].base}/${getOSImage(server.os)}`" class="os-icon" alt="" /><span class="ellipsis">{{ [server.os, server.arch].filter(Boolean).join(' · ') || '—' }}</span></p>
      </div>
      <div class="status-column">
        <span class="badge"><i class="status-dot" :class="{ online: up }" />{{ up ? t('online') : t('offline') }} <span class="status-duration">{{ duration(up ? state.now - n(server.boot_time) : state.now - n(server.last_updated), english) }}</span></span>
        <span v-if="server._sys?.show_expire === true" class="small muted expiry" :class="{ 'text-warn': days !== null && days <= 7 }">{{ days === null ? '∞' : days < 0 ? `${t('expired')} ${-days} ${t('days')}` : `${days} ${t('days')}` }}</span>
      </div>
    </div>
    <div v-if="server.tags" class="tags"><span v-for="tag in String(server.tags).split(',').filter(Boolean).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span></div>
    <div class="resource-grid">
      <Meter :label="`CPU ${n(server.cpu_cores)} ${t('cores')}`" :value="server.cpu" :foot="server.load_avg || '—'" />
      <Meter :label="t('memory')" :value="n(server.ram_total) ? percent(server.ram_used, server.ram_total) : null" :foot="`${mb(server.ram_used)} / ${mb(server.ram_total)}`" />
      <Meter :label="t('storage')" :value="n(server.disk_total) ? percent(server.disk_used, server.disk_total) : null" :foot="`${mb(server.disk_used)} / ${mb(server.disk_total)}`" />
      <Meter v-if="server._sys?.show_tf === true" :label="t('traffic')" :value="limit ? percent(trafficUsed(server), limit) : null" empty="∞" :foot="`${bytes(trafficUsed(server))} / ${limit ? bytes(limit) : '∞'}`" />
      <Meter v-else :label="t('swap')" :value="n(server.swap_total) ? percent(server.swap_used, server.swap_total) : null" :foot="`${mb(server.swap_used)} / ${mb(server.swap_total)}`" />
    </div>
    <div class="network-grid small">
      <strong class="row"><Icon name="down" />{{ rate(server.net_in_speed) }}</strong><strong class="row"><Icon name="up" />{{ rate(server.net_out_speed) }}</strong>
      <span class="row muted mono"><Icon name="down" />{{ bytes(server.net_rx) }}</span><span class="row muted mono"><Icon name="up" />{{ bytes(server.net_tx) }}</span>
    </div>
    <div v-if="visibleProbes.length" class="card-latency">
      <div class="spread muted small"><span>{{ t('latency') }}</span><span>{{ t('window') }} · {{ t('loss') }}</span></div>
      <div v-for="key in visibleProbes" :key="key" class="latency-row small">
        <span class="muted ellipsis">{{ probeName(server._config, key) }}</span>
        <strong :class="{ 'text-warn': current('ping', key) === null }">{{ latency(current('ping', key), 'ms', t('timeout')) || '—' }}</strong>
        <Sparkline :values="server.ping.map(point => point[key])" />
        <span class="mono muted loss-value">{{ latency(current('loss', key), '%', t('timeout')) || '—' }}</span>
      </div>
    </div>
    <div v-if="canPrice" class="spread small cost-row muted"><span>{{ t('costs') }}</span><strong>{{ price(server.price) === null ? t('noPrice') : price(server.price) === 0 ? t('free') : `${server.currency || '¥'} ${server.price} / ${server.billing_cycle || '—'}` }}</strong></div>
  </RouterLink>
</template>
