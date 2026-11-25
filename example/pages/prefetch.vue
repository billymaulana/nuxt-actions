<template>
  <div>
    <h1>Prefetch & Stream Cache</h1>
    <h2>prefetchAction to pre-warm cache, useStreamActionQuery with persistent cache</h2>

    <section>
      <h3 style="margin-bottom: 8px;">
        Prefetch on Hover
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Hover over a link to call <code>prefetchAction</code> which fetches data and stores it in the Nuxt payload cache.
        When you click, the data loads instantly from cache.
      </p>

      <div style="display: grid; gap: 8px;">
        <div
          v-for="item in prefetchItems"
          :key="item.label"
          style="display: flex; gap: 12px; align-items: center; padding: 12px; background: #1a1a1a; border-radius: 8px; border: 1px solid #333; cursor: pointer;"
          @mouseenter="handlePrefetch(item.label)"
          @click="handleClick(item.label)"
        >
          <span style="color: #60a5fa; flex: 1;">{{ item.label }}</span>
          <span
            v-if="prefetchedKeys.has(item.label)"
            class="badge"
            style="background: #0a2c0a; color: #4ade80;"
          >
            cached
          </span>
          <span
            v-else
            class="badge"
            style="background: #1a1a1a; color: #666;"
          >
            hover to prefetch
          </span>
        </div>
      </div>

      <div
        v-if="selectedData"
        class="success"
      >
        <strong>{{ selectedLabel }}:</strong>
        <pre>{{ JSON.stringify(selectedData, null, 2) }}</pre>
        <p style="font-size: 12px; color: #4ade80; opacity: 0.7; margin-top: 4px;">
          Loaded from cache (prefetched on hover)
        </p>
      </div>

      <pre>import { listTodos } from '#actions'

// Prefetch on hover — pre-warm the cache
async function onHover() {
  await prefetchAction(listTodos)
}

// On click — useActionQuery finds cached data instantly
const { data } = useActionQuery(listTodos, undefined)</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        useStreamActionQuery (Cached Stream)
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Stream text once, and the result is cached in the Nuxt payload. Navigate away and come back — chunks are restored from cache instantly.
      </p>

      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <button
          :disabled="streamStatus === 'streaming'"
          @click="handleStream"
        >
          {{ streamStatus === 'streaming' ? 'Streaming...' : 'Stream Text' }}
        </button>
        <button
          v-if="streamStatus === 'streaming'"
          style="background: #5f1e1e; color: #f87171;"
          @click="streamStop()"
        >
          Stop
        </button>
        <button
          v-if="streamFromCache"
          style="background: #1a2c1a; color: #4ade80;"
          @click="streamClearCache()"
        >
          Clear Cache
        </button>
      </div>

      <div
        v-if="streamFromCache"
        style="font-size: 12px; color: #4ade80; margin-bottom: 8px;"
      >
        Restored from cache ({{ streamChunks.length }} chunks)
      </div>

      <div
        v-if="streamChunks.length > 0"
        style="background: #111; padding: 16px; border-radius: 8px; min-height: 80px; white-space: pre-wrap; font-size: 14px; line-height: 1.8;"
      >
        <span
          v-for="(chunk, i) in (streamChunks as Array<{ text: string }>)"
          :key="i"
        >{{ chunk.text }}</span>
        <span
          v-if="streamStatus === 'streaming'"
          style="animation: blink 1s infinite; color: #60a5fa;"
        >|</span>
      </div>

      <div
        v-if="streamStatus !== 'idle'"
        style="margin-top: 8px; display: flex; gap: 16px; font-size: 13px; color: #666;"
      >
        <span>Status: {{ streamStatus }}</span>
        <span>Chunks: {{ streamChunks.length }}</span>
        <span>From cache: {{ streamFromCache }}</span>
      </div>

      <pre>import { generateText } from '#actions'

const {
  execute, stop, chunks, status,
  fromCache, clearCache,
} = useStreamActionQuery(generateText, {
  cacheKey: 'prefetch-demo',
})

// Stream once — cached automatically
await execute({ prompt: 'Hello' })

// On remount: chunks restored from cache
// fromCache.value === true</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { listTodos, generateText } from '#actions'

// ── Prefetch on Hover ──
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
  // Data is already cached from hover — this will be instant
  const data = await prefetchAction(listTodos)
  selectedData.value = data
}

// ── Stream with Cache ──
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

<style scoped>
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>
