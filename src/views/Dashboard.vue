<script setup>
import { computed, ref } from 'vue'
import { state, allServers, options } from '../composables/monitor.js'
import { t } from '../composables/i18n.js'
import { n, online, daysLeft } from '../utils/model.js'
import ServerCard from '../components/ServerCard.vue'
import WorldMap from '../components/WorldMap.vue'
import Summary from '../components/Summary.vue'
import Icon from '../components/Icon.vue'
const group = ref(null), region = ref(null), search = ref(''), status = ref('all'), sort = ref('default'), mapOpen = ref(true)
const groups = computed(() => [...new Set(allServers.value.map(s => s.server_group || ''))])
const grouped = computed(() => allServers.value.filter(s => group.value === null || (s.server_group || '') === group.value))
const filtered = computed(() => {
  const query = search.value.toLowerCase().trim()
  const list = grouped.value.filter(s => (!region.value || s.region?.toUpperCase() === region.value) && (!query || [s.name, s.server_group, s.tags, s.os, s.region, s.arch].join(' ').toLowerCase().includes(query)) && (status.value === 'all' || online(s, state.now) === (status.value === 'online')))
  return list.sort((a, b) => {
    if (options.value.offline_placement !== 'default' && online(a, state.now) !== online(b, state.now)) return Number(online(b, state.now)) - Number(online(a, state.now))
    if (sort.value === 'name') return String(a.name).localeCompare(String(b.name))
    if (sort.value === 'cpu') return n(b.cpu) - n(a.cpu)
    if (sort.value === 'expires') return (daysLeft(a.expire_date) ?? Infinity) - (daysLeft(b.expire_date) ?? Infinity)
    // Returning 0 preserves each backend's returned order and the apiBase order.
    return 0
  })
})
const offline = computed(() => options.value.offline_placement === 'separate' ? filtered.value.filter(s => !online(s, state.now)) : [])
const main = computed(() => options.value.offline_placement === 'separate' ? filtered.value.filter(s => online(s, state.now)) : filtered.value)
const clear = () => { search.value = ''; group.value = region.value = null; status.value = 'all'; sort.value = 'default' }
</script>
<template>
  <div class="dashboard stack">
    <div class="group-toolbar"><div class="group-tabs" role="group" :aria-label="t('nodes')"><button :class="{ active: group === null }" :aria-pressed="group === null" @click="group = null; region = null">{{ t('all') }}<span>{{ allServers.length }}</span></button><button v-for="g in groups" :key="g" :class="{ active: group === g }" :aria-pressed="group === g" @click="group = g; region = null">{{ g || t('ungrouped') }}<span>{{ allServers.filter(s => (s.server_group || '') === g).length }}</span></button></div><button v-if="options.show_globe !== false" class="button small map-toggle" @click="mapOpen = !mapOpen">{{ mapOpen ? t('hideMap') : t('showMap') }}</button></div>
    <WorldMap v-if="options.show_globe !== false && mapOpen && allServers.length" :servers="grouped" :region="region" @select="region = $event" />
    <Summary v-if="options.show_summary !== false && allServers.length" :servers="grouped.filter(s => !region || s.region?.toUpperCase() === region)" :filtered="group !== null || region !== null" />
    <div class="filter-toolbar"><label class="search-box"><Icon name="search" /><input v-model="search" :placeholder="t('search')" :aria-label="t('search')" /></label><select v-model="status" :aria-label="t('online')"><option value="all">{{ t('all') }}</option><option value="online">{{ t('online') }}</option><option value="offline">{{ t('offline') }}</option></select><select v-model="sort" :aria-label="t('defaultSort')"><option value="default">{{ t('defaultSort') }}</option><option value="name">{{ t('name') }}</option><option value="cpu">{{ t('load') }}</option><option value="expires">{{ t('expires') }}</option></select><span class="small muted node-count">{{ filtered.length }} / {{ allServers.length }}</span></div>
    <div v-if="state.busy && !allServers.length" class="node-grid" aria-busy="true"><div v-for="i in 8" :key="i" class="panel skeleton" /></div>
    <div v-else-if="!filtered.length" class="panel empty-state"><Icon name="server" /><h3>{{ t('empty') }}</h3><p class="muted">{{ t('emptyHint') }}</p><button class="button" @click="clear">{{ t('clear') }}</button></div>
    <div class="node-grid"><ServerCard v-for="s in main" :key="`${s._site}:${s.id}`" :server="s" /></div>
    <template v-if="offline.length"><h2 class="offline-heading">{{ t('offline') }} <span class="badge">{{ offline.length }}</span></h2><div class="node-grid"><ServerCard v-for="s in offline" :key="`${s._site}:${s.id}`" :server="s" /></div></template>
  </div>
</template>
