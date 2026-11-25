<template>
  <div>
    <h1>Observability</h1>
    <h2>One place to watch every action — global hooks</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        <strong style="color: #e5e5e5;">The problem:</strong> you want analytics, latency tracking, and
        error toasts for every server action — without sprinkling <code>onSuccess</code>/<code>onError</code>
        in every component.
      </p>
      <p style="color: #a3a3a3; font-size: 14px; margin-top: 8px;">
        <strong style="color: #e5e5e5;">The fix:</strong> the
        <code>action:start/success/error/settled</code> hooks fire on <code>nuxtApp</code> for every call,
        with typed payloads including <code>durationMs</code>. This page also calls the grouped namespace
        reference <code>actions.admin.metrics</code>.
      </p>
    </section>

    <section style="display: flex; gap: 8px;">
      <button
        :disabled="metrics.isExecuting.value"
        @click="metrics.execute(undefined as never)"
      >
        Load metrics (namespace)
      </button>
      <button @click="createInvalid">
        Trigger a validation error
      </button>
      <button @click="events = []">
        Clear log
      </button>
    </section>

    <section v-if="metrics.data.value">
      <div class="success">
        active: {{ metrics.data.value.activeUsers }} · requests/day: {{ metrics.data.value.requestsToday }} · p95: {{ metrics.data.value.p95LatencyMs }}ms
      </div>
    </section>

    <section>
      <h2>Hook event stream</h2>
      <pre v-if="events.length">{{ events.join('\n') }}</pre>
      <p
        v-else
        style="color: #666;"
      >
        Trigger an action to see hook events.
      </p>
    </section>

    <section>
      <h2>How it works</h2>
      <pre>// plugins/action-analytics.ts
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('action:success', ({ path, durationMs }) => {
    useTrackEvent('action', { path, durationMs })
  })
  nuxtApp.hook('action:error', ({ error }) => {
    if (error.code !== 'VALIDATION_ERROR') useToast().error(error.message)
  })
})</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onScopeDispose } from 'vue'
import { useNuxtApp } from '#app'
import { actions, createTodo } from '#actions'

const nuxtApp = useNuxtApp()
const events = ref<string[]>([])

function record(line: string) {
  events.value.unshift(`${new Date().toLocaleTimeString()}  ${line}`)
}

const unhooks = [
  nuxtApp.hook('action:start', p => record(`▶ start    ${p.method} ${p.path}`)),
  nuxtApp.hook('action:success', p => record(`✔ success  ${p.path} (${p.durationMs}ms)`)),
  nuxtApp.hook('action:error', p => record(`✘ error    ${p.path} ${p.error.code} (${p.durationMs}ms)`)),
  nuxtApp.hook('action:settled', p => record(`■ settled  ${p.path} success=${p.result.success}`)),
]
onScopeDispose(() => unhooks.forEach(unhook => unhook()))

/* actions.admin.metrics is the same typed reference as the flat adminMetrics */
const metrics = useAction(actions.admin.metrics)
const create = useAction(createTodo)

async function createInvalid() {
  await create.execute({ title: '' })
}
</script>
