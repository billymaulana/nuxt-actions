---
description: "Stream responses from server to client over Server-Sent Events with defineStreamAction and useStreamAction, for AI output and live progress."
---

# Streaming Actions

Stream data from server to client in real-time using Server-Sent Events (SSE). Ideal for AI responses, progress updates, and live data feeds.

::: tip Live Example
See streaming in action in the [Streaming example](/examples/streaming), or run `pnpm dev` in the [example repository](https://github.com/billymaulana/nuxt-actions-example) and visit `/streaming`.
:::

## How It Works

<FlowSequence from="Client" to="Server" :messages="[
  { step: 1, direction: 'forward', text: 'POST /api/_actions/ai', caption: 'execute({ prompt }) sends the input as JSON' },
  { step: 2, direction: 'note', text: 'Validate input', caption: 'Invalid input ends the stream with one error frame' },
  { step: 3, direction: 'note', text: 'Run middleware', caption: 'Builds ctx, or ends the stream with an error frame' },
  { step: 4, direction: 'back', text: 'content-type: text/event-stream', caption: 'The response opens while the handler keeps running' },
  { group: 'For each stream.send(chunk)', messages: [
    { step: 5, direction: 'back', text: 'data: {&quot;text&quot;:&quot;Hel&quot;}', caption: 'Appended to chunks' },
    { direction: 'back', text: 'data: {&quot;text&quot;:&quot;lo&quot;}' },
  ] },
  { step: 6, direction: 'back', text: 'data: {&quot;__actions_done&quot;:true}', caption: 'stream.close() sets status to done' },
]" />

1. `execute(input)` sends a POST request with the input to the action route.
2. The server validates the input. If validation fails, the stream carries a single `__actions_error` frame with `VALIDATION_ERROR`, and `status` becomes `'error'`.
3. Middleware runs and builds `ctx`. A middleware that throws an `ActionError` ends the stream the same way.
4. The server opens a `text/event-stream` response right away and keeps running the handler in the background.
5. Each `stream.send(chunk)` writes one `data:` frame. `useStreamAction` parses it and appends it to `chunks`.
6. `stream.close()` writes a final `__actions_done` frame and closes the connection. `status` becomes `'done'` and `onDone` receives every chunk.

If the handler throws, the client receives an `__actions_error` frame instead of the done frame. Calling `stop()` on the client aborts the request, and `stream.signal` on the server is aborted as well.

## Server: `defineStreamAction`

```ts
// server/actions/ai-chat.post.ts
import { z } from 'zod'

export default defineStreamAction({
  input: z.object({
    prompt: z.string().min(1, 'Prompt is required'),
  }),
  handler: async ({ input, stream }) => {
    // Simulate AI response token by token
    const words = `Here is a response to: ${input.prompt}`.split(' ')

    for (const word of words) {
      await stream.send({ text: word + ' ' })
      await new Promise(r => setTimeout(r, 80))
    }

    await stream.close()
  },
})
```

The `stream` object provides:

| Method | Description |
|--------|-------------|
| `stream.send(data)` | Send a data chunk to the client. Can be called multiple times. |
| `stream.close()` | Signal completion and close the SSE connection. |

### Real-World: AI Chat with OpenAI

```ts
// server/actions/ai-complete.post.ts
import { z } from 'zod'
import OpenAI from 'openai'

const openai = new OpenAI()

export default defineStreamAction({
  input: z.object({
    prompt: z.string().min(1).max(2000),
    model: z.enum(['gpt-4o', 'gpt-4o-mini']).default('gpt-4o-mini'),
  }),
  middleware: [authMiddleware],
  handler: async ({ input, ctx, stream }) => {
    const completion = await openai.chat.completions.create({
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      stream: true,
    })

    for await (const chunk of completion) {
      const text = chunk.choices[0]?.delta?.content
      if (text) {
        await stream.send({ text })
      }
    }

    await stream.close()
  },
})
```

### Real-World: File Processing Progress

```ts
// server/actions/process-files.post.ts
import { z } from 'zod'

export default defineStreamAction({
  input: z.object({
    fileIds: z.array(z.string()).min(1),
  }),
  handler: async ({ input, stream }) => {
    const total = input.fileIds.length

    for (let i = 0; i < total; i++) {
      await processFile(input.fileIds[i])
      await stream.send({
        progress: Math.round(((i + 1) / total) * 100),
        current: i + 1,
        total,
        fileName: input.fileIds[i],
      })
    }

    await stream.close()
  },
})
```

## Client: `useStreamAction`

```vue
<script setup lang="ts">
import { aiChat } from '#actions'

const prompt = ref('')

const { execute, chunks, data, status, stop, error } = useStreamAction(aiChat, {
  onChunk(chunk) {
    console.log('Received:', chunk)
  },
  onDone(allChunks) {
    console.log('Stream complete, total chunks:', allChunks.length)
  },
  onError(error) {
    console.error('Stream error:', error.message)
  },
})

async function send() {
  if (!prompt.value.trim()) return
  await execute({ prompt: prompt.value })
}
</script>

<template>
  <div>
    <form @submit.prevent="send">
      <input
        v-model="prompt"
        placeholder="Ask anything..."
        :disabled="status === 'streaming'"
      />
      <button :disabled="status === 'streaming' || !prompt.trim()">
        {{ status === 'streaming' ? 'Streaming...' : 'Send' }}
      </button>
    </form>

    <!-- Live streaming output -->
    <div v-if="chunks.length > 0" class="response">
      <span v-for="(chunk, i) in chunks" :key="i">{{ chunk.text }}</span>
      <span v-if="status === 'streaming'" class="cursor">|</span>
    </div>

    <!-- Stop button -->
    <button v-if="status === 'streaming'" @click="stop()">
      Stop generating
    </button>

    <!-- Error display -->
    <p v-if="error" class="error">{{ error.message }}</p>
  </div>
</template>
```

### Progress Bar Example

```vue
<script setup lang="ts">
import { processFiles } from '#actions'

const { execute, data, chunks, status } = useStreamAction(processFiles, {
  onDone() {
    alert('All files processed!')
  },
})

const progress = computed(() => data.value?.progress ?? 0)
</script>

<template>
  <div>
    <button @click="execute({ fileIds: ['a.pdf', 'b.pdf', 'c.pdf'] })">
      Process Files
    </button>

    <div v-if="status !== 'idle'" class="progress-bar">
      <div :style="{ width: `${progress}%` }" />
      <span>{{ progress }}% -- {{ data?.fileName }}</span>
    </div>
  </div>
</template>
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `onChunk` | `(chunk: T) => void` | Called for each data chunk received from the server. |
| `onDone` | `(allChunks: T[]) => void` | Called when the stream completes successfully. Receives all chunks. |
| `onError` | `(error: ActionError) => void` | Called when the stream encounters an error. |

## Return Value

| Property | Type | Description |
|----------|------|-------------|
| `execute` | `(input) => Promise<void>` | Start the stream with validated input. |
| `stop` | `() => void` | Abort the stream immediately. |
| `chunks` | `Ref<T[]>` | All received chunks so far. Grows during streaming. |
| `data` | `Ref<T \| null>` | The latest (most recent) chunk. |
| `status` | `Ref<StreamStatus>` | Current state: `'idle'` \| `'streaming'` \| `'done'` \| `'error'`. |
| `error` | `Ref<ActionError \| null>` | Error details if the stream failed. |

## With Middleware

Streaming actions support the same middleware chain as regular actions. Middleware runs **before** the stream opens:

```ts
export default defineStreamAction({
  input: z.object({ prompt: z.string() }),
  middleware: [authMiddleware, rateLimitMiddleware],
  handler: async ({ input, ctx, stream }) => {
    // ctx.user available from authMiddleware
    // Rate limit already checked by rateLimitMiddleware

    const response = await generateAIResponse(input.prompt, ctx.user)
    for await (const token of response) {
      await stream.send({ text: token })
    }
    await stream.close()
  },
})
```

## SSE Protocol

Under the hood, `defineStreamAction` uses Server-Sent Events. Each event follows this format:

| Event Type | Format | Description |
|------------|--------|-------------|
| Data chunk | `data: {"text":"hello"}\n\n` | Sent for each `stream.send()` call |
| Done | `event: done\ndata: {}\n\n` | Sent when `stream.close()` is called |
| Error | `event: error\ndata: {"code":"..."}\n\n` | Sent when handler throws |

## Error Handling

Errors during streaming are automatically caught and sent as error events:

```ts
handler: async ({ input, stream }) => {
  // Error before any chunks: client receives error immediately
  if (await isRateLimited()) {
    throw createActionError({
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      statusCode: 429,
    })
  }

  // Error during streaming: sent as error event, stream closes
  for await (const token of generateTokens(input.prompt)) {
    await stream.send({ text: token })
  }

  await stream.close()
}
```

The client receives errors via the `onError` callback and the `error` ref.

## Limitations

- **No retry support** -- Streaming actions do not support the `retry` option. Once partial data has been received, retrying would produce duplicate chunks. If the stream errors, handle it via `onError` and let the user manually retry.
- **No debounce/throttle** -- These options are not available on `useStreamAction`. Use them on `useAction` or `useOptimisticAction` instead.
- **No SSR** -- Streaming actions only run on the client. The server action itself runs on your Nitro server, but the SSE connection is established client-side.

## Best Practices

- **Always call `stream.close()`** -- Forgetting to close the stream will leave the connection open indefinitely.
- **Keep chunks small** -- Send frequent small chunks rather than rare large ones for the best user experience.
- **Validate input strictly** -- Use specific schemas with max lengths to prevent abuse of streaming endpoints.
- **Add rate limiting** -- Streaming endpoints are expensive. Use middleware to rate limit them.
- **Handle `stop()`** -- When the user stops the stream, the server may continue processing. Consider using the `event` object to check if the connection is still open.
