<script setup>
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { format } from 'date-fns'

Chart.register(...registerables)

const props = defineProps({
  data: { type: Array, default: () => [] },
  name: { type: String, default: '' },
  units: { type: String, default: '' },
  color: { type: String, default: 'rgba(255,255,255,0.7)' },
  height: { type: Number, default: 120 },
})

const canvas = ref(null)
let chart = null

const latest = computed(() => {
  if (!props.data.length) return null
  const v = props.data[props.data.length - 1].v
  return typeof v === 'number' ? v.toFixed(1) : v
})

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
}

function renderChart() {
  if (!canvas.value || !props.data.length) return
  if (chart) chart.destroy()

  const light = isLightTheme()
  const ctx = canvas.value.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, props.height)
  gradient.addColorStop(0, props.color.replace(')', ',0.15)').replace('rgb', 'rgba'))
  gradient.addColorStop(1, 'transparent')

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: props.data.map(d => format(new Date(d.t), 'HH:mm')),
      datasets: [{
        data: props.data.map(d => d.v),
        borderColor: props.color,
        backgroundColor: gradient,
        borderWidth: 1.5,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHoverBackgroundColor: props.color,
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
            label: (ctx) => `${ctx.raw} ${props.units}`,
          }
        },
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: { color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.15)', font: { size: 11, family: 'Satoshi' }, maxTicksLimit: 6 },
          border: { display: false },
        },
        y: {
          display: false,
        },
      },
      interaction: { intersect: false, mode: 'index' },
    },
  })
}

onMounted(() => nextTick(renderChart))
watch(() => props.data, () => nextTick(renderChart), { deep: true })
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between mb-2">
      <span class="text-[15px] text-dim">{{ name }}</span>
      <span class="text-[18px] font-mono font-semibold" :style="{ color, textShadow: `0 0 15px ${color}44` }">
        {{ latest ?? '—' }}
        <span class="text-[13px] text-dim">{{ units === 'int' ? '' : units }}</span>
      </span>
    </div>
    <div :style="{ height: height + 'px' }">
      <canvas v-if="data.length" ref="canvas" />
      <div v-else class="flex items-center justify-center h-full text-dim text-[15px]">No data</div>
    </div>
  </div>
</template>
