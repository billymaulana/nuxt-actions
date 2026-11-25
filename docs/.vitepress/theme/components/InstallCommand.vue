<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const prefix = 'npx nuxi module add'
const packageName = 'nuxt-actions'
const command = `${prefix} ${packageName}`
const copied = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | undefined

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(command)
  }
  catch {
    return
  }
  copied.value = true
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copied.value = false
  }, 2000)
}

onBeforeUnmount(() => clearTimeout(resetTimer))
</script>

<template>
  <div class="install">
    <code class="install-command"><span
      class="install-prompt"
      aria-hidden="true"
    >$</span> {{ prefix }} <span class="install-package">{{ packageName }}</span></code>
    <button
      type="button"
      class="install-copy"
      @click="copyCommand"
    >
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
    <span
      class="install-status"
      role="status"
    >{{ copied ? 'Install command copied to the clipboard' : '' }}</span>
  </div>
</template>
