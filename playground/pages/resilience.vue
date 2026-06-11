<script setup lang="ts">
import { ref } from 'vue'
import { flakyApi, searchTodos } from '#actions'

/* Exponential backoff against an endpoint that fails twice then succeeds */
const retried = useAction(flakyApi, {
  retry: {
    count: 3,
    delay: 200,
    backoff: 'exponential',
    maxDelay: 2000,
    jitter: true,
    statusCodes: [503],
  },
})

/* cancelPrevious: rapid typing aborts the stale request */
const query = ref('')
const search = useAction(searchTodos, { cancelPrevious: true })

async function onType() {
  const result = await search.execute({ q: query.value })
  if (!result.success && isActionError(result.error) && result.error.code === 'ABORT_ERROR') {
    return
  }
}
</script>

<template>
  <div>
    <h1>Resilience</h1>
    <h2>Retry backoff · cancelPrevious · cancel() · isActionError</h2>

    <section>
      <h2>Exponential backoff</h2>
      <p style="color: #a3a3a3; font-size: 14px;">
        <code>retry: { count: 3, delay: 200, backoff: 'exponential', maxDelay: 2000, jitter: true }</code> —
        the endpoint fails twice with 503 before succeeding; delays grow 200ms → 400ms (±jitter).
      </p>
      <button
        :disabled="retried.isExecuting.value"
        @click="retried.execute({ message: 'hello' })"
      >
        {{ retried.isExecuting.value ? 'Retrying…' : 'Call flaky endpoint' }}
      </button>
      <div
        v-if="retried.data.value"
        class="success"
      >
        Succeeded on server attempt {{ retried.data.value.attempt }}
      </div>
      <div
        v-if="retried.error.value"
        class="error"
      >
        {{ retried.error.value.code }}: {{ retried.error.value.message }}
      </div>
    </section>

    <section>
      <h2>Stale-response-free search</h2>
      <p style="color: #a3a3a3; font-size: 14px;">
        <code>cancelPrevious: true</code> aborts the in-flight request on every keystroke, and
        <code>cancel()</code> aborts manually — the UI can never be overwritten by a stale response.
      </p>
      <div style="display: flex; gap: 8px;">
        <input
          v-model="query"
          placeholder="Type fast: nuxt, app, test…"
          style="flex: 1;"
          @input="onType"
        >
        <button @click="search.cancel()">
          cancel()
        </button>
      </div>
      <div
        v-if="search.data.value"
        style="margin-top: 12px;"
      >
        <div
          v-for="todo in search.data.value.items"
          :key="todo.id"
          style="padding: 6px 0; border-bottom: 1px solid #222;"
        >
          {{ todo.title }}
        </div>
        <p
          v-if="search.data.value.items.length === 0"
          style="color: #666;"
        >
          No matches.
        </p>
      </div>
    </section>
  </div>
</template>
