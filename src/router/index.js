import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/server/:id', component: () => import('../views/ServerDetail.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFound.vue') }
  ],
  scrollBehavior: () => ({ top: 0 })
})
