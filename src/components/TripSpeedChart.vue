<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { format } from 'date-fns'

Chart.register(...registerables)

const props = defineProps({
  positions: { type: Array, default: () => [] },
  height: { type: Number, default: 160 },
})

const canvas = ref(null)
let chart = null

const speedStats = computed(() => {
  if (!props.positions?.length) return null
  const speeds = props.positions.map(p => parseFloat(p.Speed || 0)).filter(s => s > 0)
  if (!speeds.length) return null
  const max = Math.max(...speeds)
  const avg = Math.round(speeds.reduce((s, v) => s + v, 0) / speeds.length)
  const over100 = speeds.filter(s => s > 100).length
  const over130 = speeds.filter(s => s > 130).length
  return { max: Math.round(max), avg, over100, over130, total: speeds.length }
})

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
}

function renderChart() {
  if (!canvas.value || !props.positions?.length) return
  if (chart) chart.destroy()

  const light = isLightTheme()

  // Sample positions for performance (max 200 points)
  const step = Math.max(1, Math.floor(props.positions.length / 200))
  const sampled = props.positions.filter((_, i) => i % step === 0)

  const labels = sampled.map(p => {
    const ts = p.Timestamp || p.t
    return ts ? format(new Date(ts), 'HH:mm') : ''
  })
  const speeds = sampled.map(p => parseFloat(p.Speed || 0))

  const ctx = canvas.value.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, props.height)
  gradient.addColorStop(0, light ? 'rgba(0,140,0,0.12)' : 'rgba(200,255,200,0.15)')
  gradient.addColorStop(0.5, light ? 'rgba(140,100,0,0.05)' : 'rgba(255,245,200,0.05)')
  gradient.addColorStop(1, 'transparent')

  const safeColor = light ? '#0d7a0d' : 'rgba(200,255,200,0.7)'
  const warnColor = light ? '#8a6800' : '#fff5cc'
  const dangerColor = light ? '#bb2222' : '#ffaaaa'

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: speeds,
        borderColor: (ctx) => {
          const v = ctx.raw || 0
          if (v > 130) return dangerColor
          if (v > 90) return warnColor
          return safeColor
        },
        segment: {
          borderColor: (ctx) => {
            const v = ctx.p1.raw || 0
            if (v > 130) return dangerColor
            if (v > 90) return warnColor
            return safeColor
          },
        },
        backgroundColor: gradient,
        borderWidth: 1.5,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHoverBackgroundColor: light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)',
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
          callbacks: {
            label: (ctx) => `${ctx.raw} km/h`,
          },
        },
        annotation: undefined,
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: { color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.15)', font: { size: 11, family: 'Satoshi' }, maxTicksLimit: 8 },
          border: { display: false },
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: { color: light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)' },
          ticks: {
            color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.2)',
            font: { size: 11, family: 'JetBrains Mono' },
            callback: (v) => `${v}`,
          },
          border: { display: false },
        },
      },
      interaction: { intersect: false, mode: 'index' },
    },
  })
}

onMounted(() => nextTick(renderChart))
watch(() => props.positions, () => nextTick(renderChart), { deep: true })
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <span class="text-[14px] text-dim">Speed over time</span>
      <div v-if="speedStats" class="flex items-center gap-3 text-[13px] font-mono">
        <span style="color:var(--text-secondary)">avg {{ speedStats.avg }}</span>
        <span :style="{ color: speedStats.max > 130 ? 'var(--status-danger)' : 'var(--text-secondary)', fontWeight: 600 }">max {{ speedStats.max }} km/h</span>
        <span v-if="speedStats.over130" class="px-1.5 py-0.5 rounded text-[11px]" style="background:rgba(255,100,100,0.1); color:var(--status-danger)">{{ speedStats.over130 }}x &gt;130</span>
      </div>
      <span v-else-if="positions.length" class="text-[13px] text-dim font-mono">{{ positions.length }} points</span>
    </div>
    <div :style="{ height: height + 'px' }">
      <canvas v-if="positions.length" ref="canvas" />
      <div v-else class="flex items-center justify-center h-full text-dim text-[14px]">Select a trip to see speed timeline</div>
    </div>
  </div>
</template>
