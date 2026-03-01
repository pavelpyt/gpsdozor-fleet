<script setup>
import { ref } from 'vue'
import { relayInfo, fmtDate } from '../lib/utils'
import { api } from '../lib/api'

const props = defineProps({
  vehicleCode: String,
  relayState: Object,
})

const emit = defineEmits(['update'])

const loading = ref(false)
const confirm = ref(null) // 'stop' | 'release' | 'reset'

const info = () => props.relayState ? relayInfo(props.relayState.RelayState) : null

async function execute(action) {
  loading.value = true
  confirm.value = null
  let result
  if (action === 'stop') result = await api.setRelayState(props.vehicleCode, 'off')
  else if (action === 'release') result = await api.setRelayState(props.vehicleCode, 'on')
  else if (action === 'reset') result = await api.resetRelay(props.vehicleCode)
  if (result) emit('update', result)
  loading.value = false
}

async function refresh() {
  loading.value = true
  const state = await api.getRelayState(props.vehicleCode)
  if (state) emit('update', state)
  loading.value = false
}
</script>

<template>
  <div class="lumi-card p-5" style="border-color: rgba(255,100,100,0.08);">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <span class="text-[18px]" style="text-shadow: 0 0 10px rgba(255,100,100,0.3);">⚡</span>
        <span class="text-[18px] font-semibold text-lumi">Engine Control</span>
      </div>
      <button @click="refresh" class="lumi-btn-icon" :class="{ 'animate-spin': loading }">↻</button>
    </div>

    <!-- Current state -->
    <div v-if="relayState" class="mb-4 p-3 rounded-lg" style="background:var(--surface-hover); border:1px solid var(--border);">
      <div class="flex items-center gap-2 mb-1">
        <span
          class="w-2 h-2 rounded-full"
          :style="{ background: info()?.color, boxShadow: `0 0 8px ${info()?.color}88` }"
        />
        <span class="text-[18px] font-medium" :style="{ color: info()?.color }">{{ info()?.label }}</span>
        <span class="text-[14px] text-dim">(state {{ relayState.RelayState }})</span>
      </div>
      <div class="text-[14px] text-dim">{{ info()?.desc }}</div>
      <div v-if="relayState.LastEventTimestamp" class="text-[14px] text-dim mt-1">
        Last: {{ fmtDate(relayState.LastEventTimestamp) }}
      </div>
    </div>

    <!-- Confirm dialog -->
    <Transition name="page">
      <div v-if="confirm" class="mb-4 p-3.5 rounded-lg animate-fade" style="background:rgba(255,80,80,0.04); border:1px solid rgba(255,80,80,0.1);">
        <div class="text-[18px] font-medium mb-2" style="color:var(--status-danger);">
          {{ confirm === 'stop' ? '⚠ Confirm Engine STOP' : confirm === 'release' ? 'Confirm Engine Release' : '⚠ Confirm State Reset' }}
        </div>
        <div class="text-[15px] text-dim mb-3 leading-relaxed">
          <template v-if="confirm === 'stop'">This will send a command to disable the vehicle engine.</template>
          <template v-else-if="confirm === 'release'">This will re-enable the vehicle engine.</template>
          <template v-else>Resets system state to 0 without device command. Use only if vehicle is actually unlocked.</template>
        </div>
        <div class="flex gap-2">
          <button @click="execute(confirm)" class="lumi-btn" :class="confirm === 'release' ? 'lumi-btn-accent' : 'lumi-btn-danger'">
            {{ loading ? '...' : 'Confirm' }}
          </button>
          <button @click="confirm = null" class="lumi-btn">Cancel</button>
        </div>
      </div>
    </Transition>

    <!-- Actions -->
    <div v-if="!confirm" class="flex gap-2 flex-wrap">
      <button @click="confirm = 'stop'" :disabled="loading" class="lumi-btn lumi-btn-danger">
        ⬡ Engine STOP
      </button>
      <button @click="confirm = 'release'" :disabled="loading" class="lumi-btn lumi-btn-accent">
        ◈ Release
      </button>
      <button @click="confirm = 'reset'" :disabled="loading" class="lumi-btn">
        ↻ Reset
      </button>
    </div>

    <div class="mt-3 text-[13px] text-dim leading-relaxed">
      ⚠ Engine control is safety-critical. Verify actual device state after changes.
    </div>
  </div>
</template>
