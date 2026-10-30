<script setup>
import { computed } from 'vue'
import { activeDetail as server, activeHistory as history, state, selectHours } from '../composables/monitor.js'
import { t, english, probeName } from '../composables/i18n.js'
import { n, mb, bytes, rate, percent, duration, PROBES, HOURS, latency, gpu, diskIo, online, price } from '../utils/model.js'
import Meter from '../components/Meter.vue'
import HistoryChart from '../components/HistoryChart.vue'
import Icon from '../components/Icon.vue'
const rows = computed(() => history.value.map(r => ({ ...r, ram_percent: n(server.value?.ram_total) ? percent(r.ram_used, server.value.ram_total) : undefined, swap_percent: n(server.value?.swap_total) ? percent(r.swap_used, server.value.swap_total) : undefined })))
const lines = computed(() => [{ key: 'cpu', label: 'CPU' }, { key: 'ram_percent', label: t('memory') }, ...(n(server.value?.swap_total) ? [{ key: 'swap_percent', label: t('swap') }] : [])])
const probes = computed(() => PROBES.filter(k => rows.value.some(r => latency(r[`ping_${k}`]) !== null) || latency(server.value?.[`ping_${k}`]) !== null))
const io = computed(() => diskIo(server.value?.disk))
const gpuList = computed(() => {
  const result = new Map()
  for (const row of [server.value, ...rows.value]) for (const item of gpu(row?.gpu_info)) result.set(String(item.id), item)
  return [...result.values()]
})
const canPrice = computed(() => server.value?._config?.authorization === true && server.value?._sys?.show_price === true)
function rangeName(hours) { return hours === 0.167 ? t('minute10') : hours === 0.5 ? t('minute30') : `${hours} ${t('hour')}` }
function formatTime(v) { const num = Number(v); const date = new Date(Number.isFinite(num) && num > 0 ? num : v); return Number.isFinite(date.getTime()) ? date.toLocaleString(english.value ? 'en-GB' : 'zh-CN') : '—' }
</script>
<template>
  <div class="stack detail-view">
    <RouterLink class="back-link row small muted" to="/"><Icon name="arrow" />{{ t('back') }}</RouterLink>
    <template v-if="server">
      <section class="panel detail-overview">
        <div class="spread detail-title"><div><h1 class="row"><img v-if="/^[A-Za-z]{2}$/.test(server.region || '')" class="flag" :src="`${state.sites[server._site].base}/flags/${server.region.toLowerCase()}.svg`" :alt="server.region" />{{ server.name }}</h1><p class="muted small">{{ [server.server_group, server.os, server.arch].filter(Boolean).join(' · ') }}</p></div><span class="badge"><i class="status-dot" :class="{ online: online(server, state.now) }" />{{ online(server, state.now) ? t('online') : t('offline') }}</span></div>
        <div class="detail-meters"><Meter :label="`CPU ${n(server.cpu_cores)} ${t('cores')}`" :value="server.cpu" :foot="server.cpu_info" /><Meter :label="t('memory')" :value="n(server.ram_total) ? percent(server.ram_used, server.ram_total) : null" :foot="`${mb(server.ram_used)} / ${mb(server.ram_total)}`" /><Meter :label="t('storage')" :value="n(server.disk_total) ? percent(server.disk_used, server.disk_total) : null" :foot="`${mb(server.disk_used)} / ${mb(server.disk_total)}`" /><Meter :label="t('swap')" :value="n(server.swap_total) ? percent(server.swap_used, server.swap_total) : null" :foot="`${mb(server.swap_used)} / ${mb(server.swap_total)}`" /></div>
        <div class="detail-specs"><div><span>{{ t('uptime') }}</span><strong>{{ duration(state.now - n(server.boot_time), english) }}</strong></div><div><span>{{ t('network') }}</span><strong>↓ {{ rate(server.net_in_speed) }} · ↑ {{ rate(server.net_out_speed) }}</strong></div><div><span>{{ t('processes') }} / TCP / UDP</span><strong>{{ server.processes ?? '—' }} / {{ server.tcp_conn ?? '—' }} / {{ server.udp_conn ?? '—' }}</strong></div><div><span>IPv4 / IPv6</span><strong>{{ server.ip_v4 === '1' ? '✓' : '—' }} / {{ server.ip_v6 === '1' ? '✓' : '—' }}</strong></div></div>
      </section>
      <div class="range-toolbar"><h2>{{ t('resources') }}</h2><select :value="state.hours" :aria-label="t('resources')" @change="selectHours($event.target.value)"><option v-for="hours in HOURS.filter(h => server._config?.authorization === true || h <= 24)" :key="hours" :value="hours">{{ rangeName(hours) }}</option></select><span v-if="state.busy" class="small muted" role="status">{{ t('loading') }}</span></div>
      <div class="chart-grid" :aria-busy="state.busy">
        <HistoryChart :title="t('resources')" :rows="rows" :lines="lines" unit="%" />
        <HistoryChart :title="t('netHistory')" :rows="rows" :lines="[{ key: 'net_in_speed', label: '↓' }, { key: 'net_out_speed', label: '↑' }]" :format="rate" />
        <template v-if="io"><HistoryChart :title="t('io')" :rows="rows" :lines="[{ key: 'read_bps', label: t('read'), get: r => r.disk?.read_bps }, { key: 'write_bps', label: t('write'), get: r => r.disk?.write_bps }]" :format="rate" /><HistoryChart :title="`${t('io')} · IOPS`" :rows="rows" :lines="[{ key: 'read_iops', label: t('read'), get: r => r.disk?.read_iops }, { key: 'write_iops', label: t('write'), get: r => r.disk?.write_iops }]" unit=" IOPS" /></template>
        <HistoryChart v-for="g in gpuList" :key="g.id" :title="`${t('gpu')} · ${g.name}`" :rows="rows" :lines="[{ key: `gpu-${g.id}`, label: g.name, get: r => gpu(r.gpu_info).find(item => String(item.id) === String(g.id))?.info }]" unit="%" />
        <HistoryChart v-if="probes.length" :title="t('latency')" :rows="rows" :lines="probes.map(key => ({ key: `ping_${key}`, label: probeName(server._config, key) }))" unit=" ms" />
        <HistoryChart v-if="probes.some(k => rows.some(r => latency(r[`loss_${k}`]) !== null))" :title="t('loss')" :rows="rows" :lines="probes.filter(k => rows.some(r => latency(r[`loss_${k}`]) !== null)).map(key => ({ key: `loss_${key}`, label: probeName(server._config, key) }))" unit="%" />
      </div>
      <section v-if="probes.length" class="panel detail-overview"><h2>{{ t('pingHistory') }}</h2><div class="probe-grid"><div v-for="key in probes" :key="key"><span class="muted small">{{ probeName(server._config, key) }}</span><strong>{{ latency(server[`ping_${key}`], 'ms', t('timeout')) || '—' }}</strong><span class="muted small">{{ t('loss') }} {{ latency(server[`loss_${key}`], '%', t('timeout')) || '—' }}</span></div></div></section>
      <section class="panel detail-overview"><h2>{{ t('detail') }}</h2><dl class="spec-grid"><div><dt>{{ t('system') }}</dt><dd>{{ server.os || '—' }}</dd></div><div><dt>{{ t('kernel') }}</dt><dd>{{ server.kernel_version || '—' }}</dd></div><div><dt>{{ t('agent') }}</dt><dd>{{ server.agent_version || '—' }}</dd></div><div><dt>{{ t('boot') }}</dt><dd>{{ formatTime(server.boot_time) }}</dd></div><div><dt>{{ t('lastUpdate') }}</dt><dd>{{ formatTime(server.last_updated) }}</dd></div><div><dt>{{ t('totals') }}</dt><dd>↓ {{ bytes(server.net_rx) }} / ↑ {{ bytes(server.net_tx) }}</dd></div><div v-if="server._sys?.show_expire === true"><dt>{{ t('expires') }}</dt><dd>{{ server.expire_date || t('permanent') }}</dd></div><div v-if="canPrice"><dt>{{ t('billing') }}</dt><dd>{{ price(server.price) === null ? t('noPrice') : price(server.price) === 0 ? t('free') : `${server.currency || '¥'} ${server.price} / ${server.billing_cycle}` }} · {{ t('renewal') }} {{ server.auto_renewal === '1' ? t('yes') : t('no') }}</dd></div></dl></section>
    </template>
    <div v-else class="panel empty-state" :aria-busy="state.busy">{{ state.busy ? t('loading') : t('nodeNotFound') }}</div>
  </div>
</template>
