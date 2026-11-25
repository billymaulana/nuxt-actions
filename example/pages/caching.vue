<script setup lang="ts">
import { ref } from 'vue'
import { cachedReport, refreshReport } from '#actions'

const roundTripMs = ref<number | null>(null)

const report = useAction(cachedReport)

async function loadReport() {
  const startedAt = performance.now()
  await report.execute()
  roundTripMs.value = Math.round(performance.now() - startedAt)
}

const refresh = useAction(refreshReport, {
  onSuccess: () => loadReport(),
})
</script>

<template>
  <div>
    <h1>Server Cache</h1>
    <h2>The cache option on a GET action, invalidated after a write</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        The report action takes about 800 ms. With <code>cache: { maxAge: 30 }</code>, the first request runs it
        and the requests in the next 30 seconds get the stored result. Middleware such as authentication and rate
        limits would still run on every request, because the cache sits after them.
      </p>
    </section>

    <section>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button
          :disabled="report.isExecuting.value"
          @click="loadReport"
        >
          {{ report.isExecuting.value ? 'Loading…' : 'Load report' }}
        </button>
        <button
          :disabled="refresh.isExecuting.value || report.isExecuting.value"
          @click="refresh.execute()"
        >
          Invalidate and reload
        </button>
      </div>

      <div
        v-if="report.data.value"
        class="success"
      >
        Generated at {{ new Date(report.data.value.generatedAt).toLocaleTimeString() }}.
        The handler took {{ report.data.value.tookMs }} ms; this request took {{ roundTripMs }} ms.
      </div>

      <p style="color: #a3a3a3; font-size: 13px; margin-top: 8px;">
        A fast request with the same "generated at" time was served from the cache. The cache lives in the
        server's memory here; an app on several instances or serverless functions would use a shared store.
      </p>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>// server/actions/cached-report.get.ts
export default defineAction({
  input: z.object({}).optional(),
  cache: { maxAge: 30 },
  handler: async () => {
    await delay(800)
    return { generatedAt: new Date().toISOString() }
  },
})

// server/actions/refresh-report.post.ts
export default defineAction({
  handler: async () => {
    await invalidateActionCache('cached-report')
    return { invalidated: true }
  },
})</pre>
    </section>
  </div>
</template>
