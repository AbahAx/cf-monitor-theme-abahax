<script setup>
import { computed } from 'vue'
import { n } from '../utils/model.js'
const props = defineProps({ label: String, value: { default: null }, foot: String, empty: { default: '—' } })
const percent = computed(() => Math.max(0, Math.min(100, n(props.value))))
</script>
<template>
  <div class="meter">
    <div class="spread small"><span class="muted">{{ label }}</span><strong>{{ value === null || value === undefined ? empty : `${Number(percent.toFixed(1))}%` }}</strong></div>
    <div class="meter-track" role="meter" :aria-label="label" :aria-valuenow="value == null ? undefined : percent" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: `${percent}%` }" :class="{ warn: percent > 85 }" /></div>
    <div class="meter-foot mono muted" :title="foot">{{ foot || '—' }}</div>
  </div>
</template>
