<script setup>
defineProps({ name: String })
const paths = {
  terminal: 'm4 6 5 5-5 5m8 1h8', sun: 'M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7m0-12.8-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z', server: 'M4 3h16v7H4zM4 14h16v7H4zM7 6.5h.01M7 17.5h.01',
  activity: 'M2 12h5l3-9 4 18 3-9h5', globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18Z',
  down: 'M12 4v16m-6-6 6 6 6-6', up: 'M12 20V4m-6 6 6-6 6 6', settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  arrow: 'M20 12H4m6-6-6 6 6 6', search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z', close: 'm6 6 12 12M6 18 18 6',
  cpu: 'M7 7h10v10H7zM9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4M19 9h4m-4 6h4', disk: 'M4 4h16v16H4zM4 15h16M16 18h.01', coins: 'M20 7c0 3-16 3-16 0s16-3 16 0ZM4 7v10c0 3 16 3 16 0V7M4 12c0 3 16 3 16 0', clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 2', check: 'm5 12 4 4L19 6'
}
</script>
<template><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.activity" /></svg></template>
