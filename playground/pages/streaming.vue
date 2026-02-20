<template>
  <div>
    <h1>Streaming</h1>
    <h2>AI-style text streaming via Server-Sent Events</h2>

    <section>
      <form
        style="display: flex; gap: 8px;"
        @submit.prevent="handleGenerate"
      >
        <input
          v-model="prompt"
          type="text"
          placeholder="Enter a prompt..."
          style="flex: 1;"
        >
        <button
          v-if="streamAction.status.value !== 'streaming'"
          type="submit"
          :disabled="!prompt.trim()"
        >
          Generate
        </button>
        <button
          v-else
          type="button"
          style="background: #5f1e1e; color: #f87171;"
          @click="streamAction.stop()"
        >
          Stop
        </button>
      </form>
    </section>

    <section v-if="streamAction.status.value !== 'idle'">
      <div style="background: #111; padding: 16px; border-radius: 8px; min-height: 100px; white-space: pre-wrap; font-size: 14px; line-height: 1.8;">
        <span
          v-for="(chunk, i) in (streamAction.chunks.value as Array<{text: string}>)"
          :key="i"
        >{{ chunk.text }}</span>
        <span
          v-if="streamAction.status.value === 'streaming'"
          style="animation: blink 1s infinite; color: #60a5fa;"
        >|</span>
      </div>

      <div style="margin-top: 8px; display: flex; gap: 16px; font-size: 13px; color: #666;">
        <span>Status: {{ streamAction.status.value }}</span>
        <span>Chunks: {{ streamAction.chunks.value.length }}</span>
      </div>
    </section>

    <section
      v-if="streamAction.error.value"
      class="error"
    >
      {{ streamAction.error.value.message }}
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { generateText } from '#actions'

const streamAction = useStreamAction(generateText)
await streamAction.execute({ prompt: 'Hello' })
// streamAction.chunks reactively updates</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { generateText } from '#actions'

const prompt = ref('Tell me about type-safe server actions')
const streamAction = useStreamAction(generateText)

async function handleGenerate() {
  await streamAction.execute({ prompt: prompt.value })
}
</script>

<style scoped>
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>
