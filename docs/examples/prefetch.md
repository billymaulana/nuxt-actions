---
title: Prefetch & Stream Cache
description: Prefetch a query on hover with prefetchAction, then stream text with useStreamActionQuery and restore the cached chunks when the page mounts again.
---

# Prefetch & Stream Cache

Two caching tools on one page. `prefetchAction` runs a query ahead of time and stores the result in the Nuxt payload, so a later read of the same action and input resolves without a request. `useStreamActionQuery` wraps `useStreamAction` and keeps the chunks of a finished stream under a `cacheKey`, so coming back to the page shows the last stream without calling the server again.

<ExampleSource page="pages/prefetch.vue" />

## Server actions

::: code-group

```ts [server/actions/list-todos.get.ts]
export default defineAction({
  handler: async () => {
    return {
      items: [
        { id: 1, title: 'Learn Nuxt', done: true },
        { id: 2, title: 'Build app', done: false },
      ],
    }
  },
})
```

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

:::

## Page

```vue [pages/prefetch.vue]
<script setup lang="ts">
import { ref, reactive } from 'vue'
import { listTodos, generateText } from '#actions'

const prefetchItems = [
  { label: 'Todo List' },
  { label: 'Search Results' },
  { label: 'User Profile' },
]

const prefetchedKeys = reactive(new Set<string>())
const selectedData = ref<unknown>(null)
const selectedLabel = ref('')

async function handlePrefetch(label: string) {
  if (prefetchedKeys.has(label)) return
  await prefetchAction(listTodos)
  prefetchedKeys.add(label)
}

async function handleClick(label: string) {
  selectedLabel.value = label
  const data = await prefetchAction(listTodos)
  selectedData.value = data
}

const {
  execute: streamExecute,
  stop: streamStop,
  chunks: streamChunks,
  status: streamStatus,
  fromCache: streamFromCache,
  clearCache: streamClearCache,
} = useStreamActionQuery(generateText, {
  cacheKey: 'prefetch-demo',
})

async function handleStream() {
  await streamExecute({ prompt: 'Explain prefetching and caching in nuxt-actions' })
}
</script>

<template>
  <div>
    <section>
      <div
        v-for="item in prefetchItems"
        :key="item.label"
        @mouseenter="handlePrefetch(item.label)"
        @click="handleClick(item.label)"
      >
        <span>{{ item.label }}</span>
        <span v-if="prefetchedKeys.has(item.label)" class="badge">cached</span>
        <span v-else class="badge">hover to prefetch</span>
      </div>

      <div v-if="selectedData" class="success">
        <strong>{{ selectedLabel }}:</strong>
        <pre>{{ JSON.stringify(selectedData, null, 2) }}</pre>
        <p>Loaded from cache (prefetched on hover)</p>
      </div>
    </section>

    <section>
      <button :disabled="streamStatus === 'streaming'" @click="handleStream">
        {{ streamStatus === 'streaming' ? 'Streaming...' : 'Stream Text' }}
      </button>
      <button v-if="streamStatus === 'streaming'" @click="streamStop()">
        Stop
      </button>
      <button v-if="streamFromCache" @click="streamClearCache()">
        Clear Cache
      </button>

      <div v-if="streamFromCache">
        Restored from cache ({{ streamChunks.length }} chunks)
      </div>

      <div v-if="streamChunks.length > 0">
        <span
          v-for="(chunk, i) in (streamChunks as Array<{ text: string }>)"
          :key="i"
        >{{ chunk.text }}</span>
        <span v-if="streamStatus === 'streaming'">|</span>
      </div>

      <div v-if="streamStatus !== 'idle'">
        <span>Status: {{ streamStatus }}</span>
        <span>Chunks: {{ streamChunks.length }}</span>
        <span>From cache: {{ streamFromCache }}</span>
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- Hovering a row calls `prefetchAction(listTodos)`. It builds the same cache key `useActionQuery` would use, fetches the list, and stores it in the Nuxt payload.
- Clicking calls `prefetchAction(listTodos)` again. The data is already cached under that key, so it resolves without a network request.
- All three rows prefetch the same action with the same input and share one cache entry. The badges only track which rows have been hovered.
- `useStreamActionQuery` with `cacheKey: 'prefetch-demo'` saves the chunks when a stream completes. When the page mounts again, `chunks` is restored and `fromCache` is true.
- `stop()` ends a stream that is still running, and `clearCache()` drops the stored chunks.

## Related

- Guide: [SSR Queries](/guide/action-queries), [Streaming](/guide/streaming)
- API: [prefetchAction](/api/prefetch-action), [useStreamActionQuery](/api/use-stream-action-query)
