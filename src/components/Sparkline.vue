<script setup>
import { computed } from 'vue'
import { numeric } from '../utils/model.js'
const props = defineProps({ values: { type: Array, default: () => [] } })
const paths = computed(() => {
  const max = Math.max(1, ...props.values.filter(numeric)), result = []
  let current = ''
  props.values.forEach((v, i) => {
    if (!numeric(v)) { if (current) result.push(current); current = ''; return }
    const x = 2 + (i / Math.max(1, props.values.length - 1)) * 196, y = 27 - v / max * 24
    current += `${current ? ' L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  })
  if (current) result.push(current)
  return result
})
</script>
<template><svg class="sparkline" viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true"><path v-for="(d, i) in paths" :key="i" :d="d" fill="none" stroke="currentColor" stroke-width="1.3" vector-effect="non-scaling-stroke" /></svg></template>
