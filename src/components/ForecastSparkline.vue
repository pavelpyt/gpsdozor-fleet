<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'

const props = defineProps({
  past: { type: Array, default: () => [] },
  forecast: { type: Array, default: () => [] },
  height: { type: Number, default: 48 },
  width: { type: Number, default: 180 },
})

const canvas = ref(null)

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
}

function render() {
  if (!canvas.value || !props.past.length) return
  const ctx = canvas.value.getContext('2d')
  const w = props.width
  const h = props.height
  canvas.value.width = w * 2
  canvas.value.height = h * 2
  ctx.scale(2, 2)
  ctx.clearRect(0, 0, w, h)

  const light = isLightTheme()
  const all = [...props.past.map(p => p.km), ...props.forecast.map(p => p.km)]
  const max = Math.max(...all, 1)
  const total = props.past.length + props.forecast.length
  const stepX = total > 1 ? w / (total - 1) : w
  const pad = 4

  function y(val) { return pad + (h - pad * 2) * (1 - val / max) }

  // Past line
  ctx.beginPath()
  ctx.strokeStyle = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.5
  props.past.forEach((p, i) => {
    const px = i * stepX
    i === 0 ? ctx.moveTo(px, y(p.km)) : ctx.lineTo(px, y(p.km))
  })
  ctx.stroke()

  // Past fill
  ctx.beginPath()
  props.past.forEach((p, i) => {
    const px = i * stepX
    i === 0 ? ctx.moveTo(px, y(p.km)) : ctx.lineTo(px, y(p.km))
  })
  const lastPastX = (props.past.length - 1) * stepX
  ctx.lineTo(lastPastX, h - pad)
  ctx.lineTo(0, h - pad)
  ctx.closePath()
  ctx.fillStyle = light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  ctx.fill()

  // Divider line (now → future)
  ctx.beginPath()
  ctx.strokeStyle = light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)'
  ctx.setLineDash([3, 3])
  ctx.lineWidth = 1
  ctx.moveTo(lastPastX, pad)
  ctx.lineTo(lastPastX, h - pad)
  ctx.stroke()
  ctx.setLineDash([])

  // Forecast line (dashed)
  if (props.forecast.length) {
    ctx.beginPath()
    ctx.strokeStyle = light ? 'rgba(13,122,13,0.6)' : 'rgba(200,255,200,0.5)'
    ctx.setLineDash([4, 3])
    ctx.lineWidth = 1.5
    // Start from last past point
    const lastPast = props.past[props.past.length - 1]
    ctx.moveTo(lastPastX, y(lastPast.km))
    props.forecast.forEach((p, i) => {
      const px = (props.past.length + i) * stepX
      ctx.lineTo(px, y(p.km))
    })
    ctx.stroke()
    ctx.setLineDash([])

    // Forecast fill
    ctx.beginPath()
    ctx.moveTo(lastPastX, y(lastPast.km))
    props.forecast.forEach((p, i) => {
      const px = (props.past.length + i) * stepX
      ctx.lineTo(px, y(p.km))
    })
    const lastFX = (props.past.length + props.forecast.length - 1) * stepX
    ctx.lineTo(lastFX, h - pad)
    ctx.lineTo(lastPastX, h - pad)
    ctx.closePath()
    ctx.fillStyle = light ? 'rgba(13,122,13,0.06)' : 'rgba(200,255,200,0.04)'
    ctx.fill()
  }

  // Dots for past endpoints
  const dotColor = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'
  ctx.fillStyle = dotColor
  ctx.beginPath()
  ctx.arc(0, y(props.past[0].km), 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(lastPastX, y(props.past[props.past.length - 1].km), 2, 0, Math.PI * 2)
  ctx.fill()

  // Forecast end dot
  if (props.forecast.length) {
    const lastF = props.forecast[props.forecast.length - 1]
    const fx = (props.past.length + props.forecast.length - 1) * stepX
    ctx.fillStyle = light ? 'rgba(13,122,13,0.6)' : 'rgba(200,255,200,0.6)'
    ctx.beginPath()
    ctx.arc(fx, y(lastF.km), 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

onMounted(() => nextTick(render))
watch(() => [props.past, props.forecast], () => nextTick(render), { deep: true })
</script>

<template>
  <canvas ref="canvas" :style="{ width: width + 'px', height: height + 'px' }" />
</template>
