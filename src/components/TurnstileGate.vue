<script>
let scriptPromise
function loadScript() {
  if (window.turnstile) return Promise.resolve()
  return scriptPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = resolve
    script.onerror = () => { scriptPromise = null; script.remove(); reject(new Error('Turnstile script failed to load')) }
    document.head.append(script)
  })
}
</script>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { verifySite } from '../composables/monitor.js'
import { t } from '../composables/i18n.js'
const props = defineProps({ site: Object })
const target = ref(), error = ref(''), busy = ref(false)
let widget, disposed = false
async function render() {
  error.value = ''
  try {
    await loadScript()
    if (disposed) return
    if (!props.site.config.turnstile_site_key) throw new Error('Missing Turnstile site key')
    if (widget !== undefined) window.turnstile.remove(widget)
    widget = window.turnstile.render(target.value, {
      sitekey: props.site.config.turnstile_site_key, theme: 'auto',
      callback: async token => { busy.value = true; await verifySite(props.site.index, token); busy.value = false },
      'error-callback': () => { error.value = t('verifyFailed') },
      'expired-callback': () => { error.value = t('verifyFailed') }
    })
  } catch (err) { error.value = `${t('verifyFailed')}: ${err.message}` }
}
onMounted(render)
onBeforeUnmount(() => { disposed = true; if (widget !== undefined) window.turnstile?.remove(widget) })
</script>
<template><section class="panel verification-panel"><h2>{{ t('verify') }}</h2><p class="muted small">{{ site.base }} · {{ t('verifyHint') }}</p><div ref="target" :aria-busy="busy" /><p v-if="error || site.error" role="alert" class="text-warn small">{{ error || site.error }}</p><button v-if="error || site.error" class="button" :disabled="busy" @click="render">{{ t('retry') }}</button></section></template>
