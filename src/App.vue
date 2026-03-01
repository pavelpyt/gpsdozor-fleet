<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useFleetStore } from './stores/fleet'

const router = useRouter()
const route = useRoute()
const fleet = useFleetStore()

const theme = ref('dark')

let interval

onMounted(async () => {
  // Load saved theme preference
  const saved = localStorage.getItem('gpsdozor-theme')
  if (saved === 'light' || saved === 'dark') {
    theme.value = saved
    document.documentElement.setAttribute('data-theme', saved)
  }

  await fleet.init()
  interval = setInterval(() => fleet.refresh(), 60_000)
})

onUnmounted(() => clearInterval(interval))

function nav(name) { router.push({ name }) }

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
  localStorage.setItem('gpsdozor-theme', theme.value)
}
</script>

<template>
  <!-- Loading -->
  <div v-if="fleet.loading && !fleet.vehicles.length" class="min-h-screen flex items-center justify-center" :style="{ background: 'var(--surface)' }">
    <div class="text-center animate-fade">
      <div class="text-6xl mb-4">🛰️</div>
      <div class="text-2xl font-display font-bold text-lumi tracking-tight mb-2">GPS Dozor</div>
      <div class="text-[18px] text-dim mb-6">Connecting to fleet...</div>
      <div class="w-48 h-px rounded mx-auto overflow-hidden" style="background:var(--border)">
        <div class="w-1/3 h-full rounded animate-shimmer" style="background:var(--void-700)" />
      </div>
    </div>
  </div>

  <!-- Error -->
  <div v-else-if="fleet.error && !fleet.vehicles.length" class="min-h-screen flex items-center justify-center" :style="{ background: 'var(--surface)' }">
    <div class="text-center max-w-sm">
      <div class="text-5xl mb-3">⚠</div>
      <div class="text-[22px] font-display font-bold text-lumi mb-2">Connection Failed</div>
      <div class="text-[18px] text-dim mb-4">{{ fleet.error }}</div>
      <button @click="() => location.reload()" class="lumi-btn lumi-btn-accent">Retry</button>
    </div>
  </div>

  <!-- App -->
  <div v-else class="min-h-screen flex flex-col" :class="theme === 'dark' ? 'grain' : ''" :style="{ background: 'var(--surface)' }">
    <!-- Header -->
    <header class="glass-strong sticky top-0 z-50 px-5 py-3 flex items-center justify-between">
      <!-- Logo -->
      <div class="flex items-center gap-3 cursor-pointer" @click="nav('dashboard')">
        <span class="text-2xl">🛰️</span>
        <span class="font-display text-[20px] font-bold tracking-tight text-lumi">
          GPS <span style="color:var(--void-950)">Dozor</span>
        </span>
        <span v-if="fleet.activeGroup" class="text-[13px] font-mono text-dim px-2 py-0.5 rounded-md" style="background:var(--surface-raised)">
          {{ fleet.activeGroup }}
        </span>
      </div>

      <!-- Nav -->
      <nav class="flex items-center gap-1">
        <button
          v-for="item in [
            { name: 'dashboard', label: 'Dashboard', icon: '◉' },
            { name: 'fleet', label: 'Fleet', icon: '☰' },
            { name: 'compare', label: 'Compare', icon: '⇋' },
          ]"
          :key="item.name"
          @click="nav(item.name)"
          class="nav-btn"
          :class="{ 'nav-btn-active': route.name === item.name }"
        >
          <span class="text-[15px] opacity-60">{{ item.icon }}</span>
          {{ item.label }}
        </button>
        <span
          v-if="route.name === 'vehicle'"
          class="nav-btn nav-btn-active"
        >
          <span class="text-[15px] opacity-60">⬡</span>
          Vehicle
        </span>
      </nav>

      <!-- Right -->
      <div class="flex items-center gap-3">
        <span class="text-[14px] text-dim">{{ fleet.vehicles.length }} units</span>
        <!-- Theme toggle -->
        <button
          @click="toggleTheme"
          class="lumi-btn-icon"
          :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          {{ theme === 'dark' ? '☀' : '☾' }}
        </button>
        <button @click="fleet.refresh()" class="lumi-btn-icon" title="Refresh">
          ↻
        </button>
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1 flex">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style>
/* Nav button */
.nav-btn {
  @apply flex items-center gap-1.5 px-4 py-2 rounded-lg text-[16px] font-medium transition-all duration-200 cursor-pointer;
  color: var(--text-dim);
}
.nav-btn:hover {
  color: var(--text-secondary);
  background: var(--surface-hover);
}
.nav-btn-active {
  color: var(--text-primary) !important;
  background: var(--surface-raised) !important;
  box-shadow: 0 0 20px var(--glow-shadow);
}

/* Luminescent button */
.lumi-btn {
  @apply inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[15px] font-medium transition-all duration-200 cursor-pointer;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  box-shadow: 0 0 12px var(--glow-shadow);
}
.lumi-btn:hover {
  background: var(--surface-hover);
  border-color: var(--border-strong);
  box-shadow: 0 0 25px var(--glow-shadow);
  color: var(--text-primary);
}

.lumi-btn-accent {
  background: var(--glow-strong);
  border-color: var(--border-strong);
  color: var(--text-primary);
  box-shadow: 0 0 20px var(--glow-shadow);
}
.lumi-btn-accent:hover {
  box-shadow: 0 0 35px var(--glow-shadow);
}

.lumi-btn-danger {
  background: rgba(255,100,100,0.08);
  border: 1px solid rgba(255,100,100,0.15);
  color: #cc3333;
  box-shadow: 0 0 15px rgba(255,100,100,0.06);
}
[data-theme="dark"] .lumi-btn-danger {
  color: #ffaaaa;
}
.lumi-btn-danger:hover {
  background: rgba(255,100,100,0.15);
  box-shadow: 0 0 25px rgba(255,100,100,0.1);
}

.lumi-btn-icon {
  @apply w-9 h-9 flex items-center justify-center rounded-lg text-[18px] transition-all duration-200 cursor-pointer;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  color: var(--text-dim);
}
.lumi-btn-icon:hover {
  background: var(--surface-raised);
  box-shadow: 0 0 20px var(--glow-shadow);
  color: var(--text-primary);
}

/* Luminescent card */
.lumi-card {
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 0 20px var(--glow-shadow);
  transition: all 0.3s;
}
.lumi-card:hover {
  border-color: var(--border-strong);
}

.lumi-card-interactive {
  cursor: pointer;
}
.lumi-card-interactive:hover {
  border-color: var(--border-strong);
  box-shadow: 0 0 30px var(--glow-shadow);
}

/* Stat display */
.lumi-stat {
  @apply font-display font-bold tracking-tight;
  text-shadow: 0 0 25px var(--glow-shadow);
}

/* Input */
.lumi-input {
  @apply w-full rounded-lg text-[18px] outline-none transition-all duration-200;
  padding: 8px 14px;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.lumi-input::placeholder {
  color: var(--text-muted);
}
.lumi-input:focus {
  border-color: var(--border-strong);
  box-shadow: 0 0 20px var(--glow-shadow);
}

.lumi-select {
  @apply rounded-lg text-[18px] outline-none cursor-pointer transition-all duration-200;
  padding: 8px 14px;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.lumi-select:focus {
  border-color: var(--border-strong);
  box-shadow: 0 0 15px var(--glow-shadow);
}

/* Badge */
.lumi-badge {
  @apply inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[14px] font-semibold;
}

/* Page transitions */
.page-enter-active { animation: rise 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.page-leave-active { animation: fade 0.15s ease-out reverse; }
</style>
