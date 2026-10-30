<script setup>
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { state, primary, options, adminLinks, loadPage, resumeSite, retrySite, activeDetail } from './composables/monitor.js'
import { t, english } from './composables/i18n.js'
import Icon from './components/Icon.vue'
import TurnstileGate from './components/TurnstileGate.vue'
import ThemeSettings from './components/ThemeSettings.vue'
const route = useRoute(), manualDark = ref(null), settingsOpen = ref(false), osDark = ref(matchMedia('(prefers-color-scheme: dark)').matches)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { osDark.value = e.matches })
const dark = computed(() => manualDark.value ?? (primary.value.preferred_theme === 'dark' || (primary.value.preferred_theme !== 'light' && osDark.value)))
const initialTitle = document.title
const title = computed(() => primary.value.site_title || initialTitle)
const sources = computed(() => route.params.id ? [state.sites[Number(route.query.site) || 0] || state.sites[0]] : state.sites)
const activeStatus = computed(() => sources.value.every(s => s.status === 'live') ? 'live' : sources.value.find(s => s.status !== 'live')?.status || 'idle')
watch(() => route.fullPath, () => {
  if (route.path === '/' || route.params.id) void loadPage({ id: route.params.id ? String(route.params.id) : null, site: Number(route.query.site) || 0 })
}, { immediate: true })
watchEffect(() => {
  document.documentElement.classList.toggle('dark', dark.value)
  document.documentElement.lang = english.value ? 'en' : 'zh-CN'
  document.title = [route.params.id ? activeDetail.value?.name : '', title.value].filter(Boolean).join(' · ')
  document.documentElement.style.setProperty('--panel-opacity', String(Math.max(.15, Math.min(1, Number(options.value.panel_opacity) || 1))))
})
const staticBackground = document.querySelector('meta[name="backgroundImage"]')?.content
if (staticBackground) {
  const image = new Image()
  image.onload = () => { document.body.style.backgroundImage = `url(${JSON.stringify(staticBackground)})`; document.body.style.backgroundSize = 'cover'; document.body.style.backgroundAttachment = 'fixed' }
  image.onerror = () => { state.sites[0].error = 'Background image failed to load' }
  image.src = staticBackground
}
</script>
<template>
  <div class="theme-shell">
    <header class="site-header"><div class="header-inner"><RouterLink to="/" class="site-brand"><span class="brand-icon"><Icon name="terminal" /></span><strong>{{ title }}</strong></RouterLink><div class="header-actions"><span class="connection-label small muted"><i class="status-dot" :class="{ online: activeStatus === 'live' }" />{{ t(activeStatus) }}</span><template v-for="link in adminLinks" :key="link.index"><a class="button header-admin" :href="link.url" :title="link.base">{{ t('admin') }}{{ adminLinks.length > 1 ? ` ${link.index + 1}` : '' }}</a></template><button v-if="primary.authorization === true" class="icon-button" :title="t('settings')" :aria-label="t('settings')" @click="settingsOpen = true"><Icon name="settings" /></button><button class="icon-button theme-toggle" :title="t('theme')" :aria-label="t('theme')" @click="manualDark = !dark"><Icon :name="dark ? 'sun' : 'moon'" /></button></div></div></header>
    <main class="main-container">
      <div v-if="!state.initialized" class="initial-loading" role="status">{{ t('loading') }}</div>
      <template v-for="site in sources" :key="site.index">
        <TurnstileGate v-if="site.verification" :site="site" />
        <div v-else-if="site.error" class="error-banner" role="alert"><span>{{ state.sites.length > 1 ? `${site.base}: ` : '' }}{{ site.error }}</span><button class="button" @click="retrySite(site.index)">{{ t('retry') }}</button></div>
        <div v-if="site.paused" class="panel timeout-panel"><div><strong>{{ t('timeoutTitle') }}</strong><p class="small muted">{{ t('timeoutHint') }}</p></div><button class="button" @click="resumeSite(site.index)">{{ t('resume') }}</button></div>
        <div v-else-if="['disconnected', 'authError', 'invalidMessage'].includes(site.status)" class="error-banner" role="status"><span>{{ t(site.status) }}</span><button v-if="site.status !== 'authError'" class="button" @click="resumeSite(site.index)">{{ t('resume') }}</button><a v-else class="button" :href="adminLinks[site.index].url">{{ t('admin') }}</a></div>
      </template>
      <RouterView v-if="state.initialized" />
    </main>
    <footer class="site-footer"><span>AbahAx · {{ t('nodes') }}</span><a href="https://github.com/huilang-me/CF-Server-Monitor/" target="_blank" rel="noopener noreferrer" :title="primary.version || ''">Powered by CF Server Monitor</a><span class="mono">{{ primary.version || '' }}</span></footer>
    <ThemeSettings v-if="settingsOpen && primary.authorization === true" @close="settingsOpen = false" />
  </div>
</template>
