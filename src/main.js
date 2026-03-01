import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import DashboardPage from './pages/DashboardPage.vue'
import FleetPage from './pages/FleetPage.vue'
import VehicleDetailPage from './pages/VehicleDetailPage.vue'
import ComparePage from './pages/ComparePage.vue'
import './index.css'

const routes = [
  { path: '/', name: 'dashboard', component: DashboardPage },
  { path: '/fleet', name: 'fleet', component: FleetPage },
  { path: '/vehicle/:code', name: 'vehicle', component: VehicleDetailPage, props: true },
  { path: '/compare', name: 'compare', component: ComparePage },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
