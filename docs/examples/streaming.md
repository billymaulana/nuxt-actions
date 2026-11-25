---
title: Streaming
description: Stream generated text from defineStreamAction over Server-Sent Events, render each chunk as it arrives with useStreamAction, and stop mid-stream.
---

# Streaming

A streaming action sends its result to the client in pieces instead of one response. `defineStreamAction` gives the handler a `stream` with `send()` and `close()`, and `useStreamAction` collects each piece in `chunks` as it arrives over Server-Sent Events. This is the shape for AI text generation, progress reporting, and other long-running work.

<ExampleSource page="pages/streaming.vue" />

## Server action

```ts [server/actions/generate-text.post.ts]
import { z } from 'zod'

export default defineStreamAction({
  input: z.object({
    prompt: z.string().min(1, 'Prompt is required'),
  }),
  handler: async ({ input, stream }) => {
    const words = [
      `Here is a response to "${input.prompt}":`,
      'The quick brown fox jumps over the lazy dog.',
      'This demonstrates streaming server actions with real-time text generation.',
    ].join(' ').split(' ')

    for (const word of words) {
      await stream.send({ text: word + ' ' })
      await new Promise(r => setTimeout(r, 80))
    }

    await stream.close()
  },
})
```

## Page

```vue [pages/streaming.vue]
<script setup lang="ts">
import { ref } from 'vue'
import { generateText } from '#actions'

const prompt = ref('Tell me about type-safe server actions')
const streamAction = useStreamAction(generateText)

async function handleGenerate() {
  await streamAction.execute({ prompt: prompt.value })
}
</script>

<template>
  <div>
    <section>
      <form @submit.prevent="handleGenerate">
        <input v-model="prompt" type="text" placeholder="Enter a prompt...">
        <button
          v-if="streamAction.status.value !== 'streaming'"
          type="submit"
          :disabled="!prompt.trim()"
        >
          Generate
        </button>
        <button v-else type="button" @click="streamAction.stop()">
          Stop
        </button>
      </form>
    </section>

    <section v-if="streamAction.status.value !== 'idle'">
      <div>
        <span
          v-for="(chunk, i) in (streamAction.chunks.value as Array<{ text: string }>)"
          :key="i"
        >{{ chunk.text }}</span>
        <span v-if="streamAction.status.value === 'streaming'">|</span>
      </div>

      <div>
        <span>Status: {{ streamAction.status.value }}</span>
        <span>Chunks: {{ streamAction.chunks.value.length }}</span>
      </div>
    </section>

    <section v-if="streamAction.error.value" class="error">
      {{ streamAction.error.value.message }}
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- Each `stream.send({ text })` call becomes one Server-Sent Event, and `useStreamAction` appends its payload to `chunks`.
- The handler waits 80 ms between words, so the text appears word by word.
- `stream.close()` ends the stream, and `status` moves from `'streaming'` to `'done'`.
- `stop()` aborts the stream from the client. `status` becomes `'done'`, so the Stop button turns back into Generate.
- The prompt goes through the schema before the handler runs. The Generate button is disabled for an empty prompt, and the server would reject one with a validation error.

## Related

- Guide: [Streaming](/guide/streaming)
- API: [defineStreamAction](/api/define-stream-action), [useStreamAction](/api/use-stream-action)
