<script setup>import { t } from '../composables/i18n.js'</script>
<template><div class="panel empty-state"><h2>{{ t('notFound') }}</h2><RouterLink class="button" to="/">{{ t('back') }}</RouterLink></div></template>
