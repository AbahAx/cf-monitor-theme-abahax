<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import Sparkline from './Sparkline.vue'
import { totalStats, state } from '../composables/monitor.js'
import { t } from '../composables/i18n.js'
import { n, bytes, mb, rate, costs, daysLeft, online } from '../utils/model.js'
const props = defineProps({ servers: Array, filtered: Boolean })
const stats = computed(() => props.filtered ? {
  total: props.servers.length, online: props.servers.filter(s => online(s, state.now)).length,
  offline: props.servers.filter(s => !online(s, state.now)).length,
  globalSpeedIn: props.servers.filter(s => online(s, state.now)).reduce((a, s) => a + n(s.net_in_speed), 0),
  globalSpeedOut: props.servers.filter(s => online(s, state.now)).reduce((a, s) => a + n(s.net_out_speed), 0),
  globalNetRx: props.servers.reduce((a, s) => a + n(s.net_rx), 0), globalNetTx: props.servers.reduce((a, s) => a + n(s.net_tx), 0)
} : totalStats.value)
const hardware = computed(() => ({ cores: props.servers.reduce((a, s) => a + n(s.cpu_cores), 0), memory: props.servers.reduce((a, s) => a + n(s.ram_total), 0), disk: props.servers.reduce((a, s) => a + n(s.disk_total), 0) }))
const peak = computed(() => props.servers.filter(s => online(s, state.now)).reduce((a, s) => n(s.cpu) > n(a?.cpu) ? s : a, null))
const prices = computed(() => costs(props.servers.filter(s => s._config?.authorization === true && s._sys?.show_price === true)))
const expiry = computed(() => props.servers.filter(s => s._sys?.show_expire === true && daysLeft(s.expire_date) !== null).sort((a, b) => daysLeft(a.expire_date) - daysLeft(b.expire_date)).slice(0, 3))
</script>
<template>
  <div class="summary-grid">
    <div class="panel summary-tile"><div class="tile-label"><Icon name="server" />{{ t('nodes') }}</div><div class="tile-number">{{ stats.online || 0 }}<small> / {{ stats.total || 0 }}</small></div><div class="small" :class="{ 'text-green': !stats.offline }">{{ t('online') }} {{ stats.online || 0 }} · {{ t('offline') }} {{ stats.offline || 0 }}</div></div>
    <div class="panel summary-tile"><div class="tile-label"><Icon name="activity" />{{ t('peak') }}</div><div class="tile-number">{{ peak ? n(peak.cpu).toFixed(1) : '—' }}<small>%</small></div><div class="small muted ellipsis">{{ peak?.name || '—' }}</div></div>
    <div class="panel summary-tile"><div class="tile-label"><Icon name="down" />{{ t('totals') }}</div><div class="flow-pair"><span>↓ {{ bytes(stats.globalNetRx) }}</span><span>↑ {{ bytes(stats.globalNetTx) }}</span></div><div class="small muted">{{ t('traffic') }} · {{ bytes(servers.filter(s => s._sys?.show_tf).reduce((a, s) => a + n(s.net_rx_monthly) + n(s.net_tx_monthly), 0)) }}</div></div>
    <div class="panel summary-tile"><div class="tile-label"><Icon name="activity" />{{ t('network') }}</div><div class="flow-pair"><span>↓ {{ rate(stats.globalSpeedIn) }}</span><span>↑ {{ rate(stats.globalSpeedOut) }}</span></div><Sparkline :values="state.sites[0]?.speed.map(p => p.in + p.out) || []" /></div>
  </div>
  <div class="extra-summary">
    <div class="panel summary-tile hardware-tile"><div class="tile-label"><Icon name="cpu" />{{ t('hardware') }}</div><div class="hardware-values"><span><b>{{ hardware.cores }}</b> {{ t('cores') }}</span><span>{{ t('memory') }} <b>{{ mb(hardware.memory) }}</b></span><span>{{ t('storage') }} <b>{{ mb(hardware.disk) }}</b></span></div></div>
    <div v-if="prices.length" class="panel summary-tile"><div class="tile-label"><Icon name="coins" />{{ t('costs') }}<span class="muted">/ {{ t('byCurrency') }}</span></div><div class="flow-pair"><b v-for="value in prices" :key="value">{{ value }}</b></div></div>
    <div v-if="expiry.length" class="panel summary-tile"><div class="tile-label"><Icon name="clock" />{{ t('expiryRank') }}</div><div class="expiry-list"><RouterLink v-for="s in expiry" :key="`${s._site}:${s.id}`" :to="{ path: `/server/${s.id}`, query: { site: s._site } }" class="spread small"><span class="ellipsis">{{ s.name }}</span><span class="mono" :class="{ 'text-warn': daysLeft(s.expire_date) <= 7 }">{{ daysLeft(s.expire_date) }} {{ t('days') }}</span></RouterLink></div></div>
  </div>
</template>
