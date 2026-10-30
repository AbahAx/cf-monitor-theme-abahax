<script setup>
import { ref, onMounted } from 'vue'
import { options, updateOptions, state } from '../composables/monitor.js'
import { t } from '../composables/i18n.js'
import Icon from './Icon.vue'
defineEmits(['close'])
const dialog = ref(), draft = ref({ ...options.value }), error = ref(''), saved = ref(false)
onMounted(() => dialog.value.showModal())
async function save() {
  error.value = ''; saved.value = false
  try { await updateOptions(draft.value); saved.value = true } catch (err) { error.value = err.message }
}
</script>
<template><dialog ref="dialog" class="settings-dialog" @close="$emit('close')" @click="event => { if (event.target === dialog) dialog.close() }"><div class="spread"><h2>{{ t('settings') }}</h2><button class="icon-button" :aria-label="t('close')" @click="dialog.close()"><Icon name="close" /></button></div><p class="muted small">{{ t('backendSettings') }}</p><form class="settings-form" @submit.prevent="save"><label v-for="[key, label] in [['show_summary', 'summary'], ['show_globe', 'globe'], ['show_latency', 'showLatency']]" :key="key" class="spread"><span>{{ t(label) }}</span><input v-model="draft[key]" type="checkbox" /></label><p class="small muted">{{ t('adminPrices') }}</p><label>{{ t('offlinePlacement') }}<select v-model="draft.offline_placement"><option value="default">{{ t('mixed') }}</option><option value="bottom">{{ t('bottom') }}</option><option value="separate">{{ t('separate') }}</option></select></label><label>{{ t('pingLines') }}<input v-model="draft.ping_lines" type="text" /></label><label>{{ t('opacity') }} <span class="mono">{{ draft.panel_opacity }}</span><input v-model.number="draft.panel_opacity" type="range" min="0.15" max="1" step="0.05" /></label><p v-if="error" role="alert" class="text-warn small">{{ error }}</p><p v-if="saved" role="status" class="text-green small">{{ t('saved') }}</p><button class="button primary-button" :disabled="state.saving">{{ state.saving ? t('saving') : t('save') }}</button></form></dialog></template>
