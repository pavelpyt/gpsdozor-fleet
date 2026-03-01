<script setup>
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { ECO_TYPES } from '../lib/utils'

Chart.register(...registerables)

const props = defineProps({
  events: { type: Array, default: () => [] },
  height: { type: Number, default: 180 },
})

const canvas = ref(null)
let chart = null

const colorMap = {
  'Braking': 'rgba(255,170,170,0.8)',
  'Acceleration': 'rgba(255,200,140,0.8)',
  'Cornering': 'rgba(255,245,200,0.8)',
  'Corner L': 'rgba(255,245,200,0.7)',
  'Corner R': 'rgba(255,245,200,0.6)',
  'Bump': 'rgba(200,200,255,0.7)',
}

const summary = computed(() => {
  if (!props.events.length) return []
  const counts = {}
  props.events.forEach(ev => {
    const type = ECO_TYPES[ev.EventType] || 'Unknown'
    if (!counts[type]) counts[type] = { name: type, total: 0, high: 0, med: 0, low: 0 }
    counts[type].total++
    if (ev.EventSeverity === 3) counts[type].high++
    else if (ev.EventSeverity === 2) counts[type].med++
    else if (ev.EventSeverity === 1) counts[type].low++
  })
  return Object.values(counts).sort((a, b) => b.total - a.total)
})

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
}

function renderChart() {
  if (!canvas.value || !summary.value.length) return
  if (chart) chart.destroy()

  const light = isLightTheme()

  chart = new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: summary.value.map(s => s.name),
      datasets: [{
        data: summary.value.map(s => s.total),
        backgroundColor: summary.value.map(s => colorMap[s.name] || (light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)')),
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: light ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.9)',
          borderColor: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleFont: { family: 'Satoshi', size: 14 },
          bodyFont: { family: 'JetBrains Mono', size: 14 },
          titleColor: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
          bodyColor: light ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
          padding: 8,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.2)', font: { size: 13, family: 'Satoshi' } },
          border: { display: false },
        },
        y: { display: false },
      },
    },
  })
}

onMounted(() => nextTick(renderChart))
watch(summary, () => nextTick(renderChart))
</script>

<template>
  <div>
    <div class="flex items-center gap-4 mb-3 text-[14px] text-dim">
      <span>{{ events.length }} events</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#ffaaaa"></span> High</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#ffd88c"></span> Medium</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#fff5cc"></span> Low</span>
    </div>

    <div :style="{ height: height + 'px' }">
      <canvas v-if="summary.length" ref="canvas" />
      <div v-else class="flex items-center justify-center h-full text-dim text-[15px]">No eco events</div>
    </div>

    <!-- Detail grid -->
    <div v-if="summary.length" class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
      <div
        v-for="item in summary.slice(0, 6)"
        :key="item.name"
        class="rounded-lg p-2.5 text-[15px]"
        style="background: var(--surface-hover); border: 1px solid var(--border);"
      >
        <div class="font-medium mb-1" :style="{ color: colorMap[item.name] || 'var(--text-secondary)' }">
          {{ item.name }}
        </div>
        <div class="flex gap-2 text-dim">
          <span>{{ item.total }}×</span>
          <span v-if="item.high" style="color:#ffaaaa">{{ item.high }} high</span>
          <span v-if="item.med" style="color:#ffd88c">{{ item.med }} med</span>
        </div>
      </div>
    </div>
  </div>
</template>
