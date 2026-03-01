<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const props = defineProps({
  past: { type: Array, default: () => [] },      // [{ date, label, km }]
  forecast: { type: Array, default: () => [] },   // [{ date, label, km }]
  height: { type: Number, default: 180 },
})

const canvas = ref(null)
let chart = null

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
}

function renderChart() {
  if (!canvas.value || !props.past.length) return
  if (chart) chart.destroy()

  const light = isLightTheme()
  const ctx = canvas.value.getContext('2d')

  const labels = [...props.past.map(d => d.label), ...props.forecast.map(d => d.label)]
  const pastData = props.past.map(d => d.km)
  const forecastData = [...new Array(props.past.length).fill(null), ...props.forecast.map(d => d.km)]
  // Bridge: connect past and forecast lines
  if (props.forecast.length && pastData.length) {
    forecastData[pastData.length - 1] = pastData[pastData.length - 1]
  }

  const pastGradient = ctx.createLinearGradient(0, 0, 0, props.height)
  pastGradient.addColorStop(0, light ? 'rgba(0,140,0,0.12)' : 'rgba(200,255,200,0.15)')
  pastGradient.addColorStop(1, 'transparent')

  const forecastGradient = ctx.createLinearGradient(0, 0, 0, props.height)
  forecastGradient.addColorStop(0, light ? 'rgba(0,80,200,0.08)' : 'rgba(180,200,255,0.1)')
  forecastGradient.addColorStop(1, 'transparent')

  const datasets = [
    {
      label: 'Actual',
      data: pastData,
      backgroundColor: pastGradient,
      borderColor: light ? 'rgba(0,140,0,0.7)' : 'rgba(200,255,200,0.6)',
      borderWidth: 0,
      fill: true,
      type: 'bar',
      borderRadius: 3,
      order: 1,
    },
  ]

  if (props.forecast.length) {
    datasets.push({
      label: 'Forecast',
      data: forecastData,
      borderColor: light ? 'rgba(0,80,200,0.5)' : 'rgba(180,200,255,0.4)',
      borderWidth: 2,
      borderDash: [4, 4],
      fill: false,
      type: 'line',
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: light ? 'rgba(0,80,200,0.7)' : 'rgba(180,200,255,0.7)',
      order: 0,
    })
  }

  chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: props.forecast.length > 0,
          labels: {
            boxWidth: 12,
            boxHeight: 2,
            color: light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)',
            font: { size: 11, family: 'Satoshi' },
            padding: 8,
          },
          position: 'top',
          align: 'end',
        },
        tooltip: {
          backgroundColor: light ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.9)',
          borderColor: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleFont: { family: 'Satoshi', size: 13 },
          bodyFont: { family: 'JetBrains Mono', size: 13 },
          titleColor: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
          bodyColor: light ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
          padding: 8,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              if (ctx.raw === null) return null
              const prefix = ctx.dataset.label === 'Forecast' ? '~ ' : ''
              return `${ctx.dataset.label}: ${prefix}${ctx.raw.toFixed(1)} km`
            },
          },
          filter: (item) => item.raw !== null,
        },
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.15)',
            font: { size: 10, family: 'Satoshi' },
            maxTicksLimit: 10,
          },
          border: { display: false },
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: { color: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)' },
          ticks: {
            color: light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.15)',
            font: { size: 10, family: 'JetBrains Mono' },
            callback: (v) => `${v} km`,
          },
          border: { display: false },
        },
      },
      interaction: { intersect: false, mode: 'index' },
    },
  })
}

onMounted(() => nextTick(renderChart))
watch([() => props.past, () => props.forecast], () => nextTick(renderChart), { deep: true })
</script>

<template>
  <div :style="{ height: height + 'px' }">
    <canvas v-if="past.length" ref="canvas" />
    <div v-else class="flex items-center justify-center h-full text-dim text-[13px]">No daily data available</div>
  </div>
</template>
