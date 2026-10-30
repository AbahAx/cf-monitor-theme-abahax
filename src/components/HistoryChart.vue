<script setup>
import { computed } from 'vue'
import { numeric } from '../utils/model.js'
import { t, english } from '../composables/i18n.js'
const props = defineProps({ title: String, rows: Array, lines: Array, unit: { default: '' }, format: Function })
const width = 640, height = 160, left = 54, right = 622, top = 15, bottom = 130
const read = (row, line) => line.get ? line.get(row) : row[line.key]
const plot = computed(() => {
  const times = props.rows.map(r => Number(r.timestamp)).filter(numeric)
  const minTime = Math.min(...times), maxTime = Math.max(...times)
  const values = props.lines.flatMap(line => props.rows.map(row => read(row, line))).filter(numeric)
  const max = Math.max(props.unit === '%' ? 100 : 1, ...values) * (props.unit === '%' ? 1 : 1.08)
  const series = props.lines.map((line, index) => {
    let d = '', paths = [], points = []
    for (const row of props.rows) {
      const value = read(row, line), ts = Number(row.timestamp)
      if (!numeric(value) || !numeric(ts)) { if (d) paths.push(d); d = ''; continue }
      const x = left + (ts - minTime) / Math.max(1, maxTime - minTime) * (right - left), y = bottom - Math.max(0, value) / max * (bottom - top)
      d += `${d ? ' L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
      points.push({ x, y, value, ts })
    }
    if (d) paths.push(d)
    const last = [...props.rows].reverse().find(r => read(r, line) !== undefined && read(r, line) !== false)
    return { ...line, paths, points, value: last ? read(last, line) : undefined, color: line.color || ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'][index % 4] }
  })
  return { series, max, minTime, maxTime, hasValues: values.length > 0 }
})
const formatValue = v => v === null ? t('timeout') : v === undefined || v === false ? '—' : props.format ? props.format(v) : `${Number(v.toFixed(1))}${props.unit}`
const time = ts => Number.isFinite(ts) ? new Date(ts).toLocaleTimeString(english.value ? 'en-GB' : 'zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
</script>
<template>
  <section class="panel chart-panel">
    <h3>{{ title }}</h3>
    <div class="chart-legend"><span v-for="line in plot.series" :key="line.key" class="small"><i :style="{ background: line.color }" />{{ line.label }} <b class="mono">{{ formatValue(line.value) }}</b></span></div>
    <svg v-if="rows.length" :viewBox="`0 0 ${width} ${height}`" class="history-chart" role="img" :aria-label="title">
      <g v-for="step in [0, 1, 2, 3]" :key="step"><line :x1="left" :x2="right" :y1="bottom - step / 3 * (bottom - top)" :y2="bottom - step / 3 * (bottom - top)" class="chart-grid" /><text x="46" :y="bottom - step / 3 * (bottom - top) + 3" text-anchor="end" class="chart-label">{{ format ? format(plot.max * step / 3) : `${Number((plot.max * step / 3).toFixed(0))}${unit}` }}</text></g>
      <g v-for="line in plot.series" :key="line.key"><path v-for="(d, i) in line.paths" :key="i" :d="d" fill="none" :stroke="line.color" stroke-width="1.7" vector-effect="non-scaling-stroke" /><circle v-for="(p, i) in line.points" :key="i" :cx="p.x" :cy="p.y" r="3" :fill="line.color" class="chart-point"><title>{{ new Date(p.ts).toLocaleString() }} · {{ line.label }}: {{ formatValue(p.value) }}</title></circle></g>
      <text :x="left" y="152" class="chart-label">{{ time(plot.minTime) }}</text><text :x="right" y="152" text-anchor="end" class="chart-label">{{ time(plot.maxTime) }}</text>
      <text v-if="!plot.hasValues" x="320" y="80" text-anchor="middle" class="chart-label">{{ t('noSupportedData') }}</text>
    </svg>
    <div v-else class="chart-empty muted small">{{ t('noHistory') }}</div>
  </section>
</template>
