import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import './style.css'

const app = createApp(App).use(router)
// Resolve lazy hash routes before the root watcher starts any REST or WS work.
router.isReady().then(() => app.mount('#app')).catch(error => {
  document.getElementById('app').textContent = `Theme failed to load: ${error.message}`
  console.error(error)
})
