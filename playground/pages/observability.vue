<script setup lang="ts">
import { ref, onScopeDispose } from 'vue'
import { useNuxtApp } from '#app'
import { actions, createTodo } from '#actions'

const nuxtApp = useNuxtApp()
const events = ref<string[]>([])

function record(line: string) {
  events.value.unshift(`${new Date().toLocaleTimeString()} ${line}`)
}

const unhooks = [
  nuxtApp.hook('action:start', p => record(`▶ start   ${p.method} ${p.path}`)),
  nuxtApp.hook('action:success', p => record(`✔ success ${p.path} in ${p.durationMs}ms`)),
  nuxtApp.hook('action:error', p => record(`✘ error   ${p.path} ${p.error.code} in ${p.durationMs}ms`)),
  nuxtApp.hook('action:settled', p => record(`■ settled ${p.path} (success=${p.result.success})`)),
]
onScopeDispose(() => unhooks.forEach(unhook => unhook()))

/* Namespace access: actions.admin.stats === flat adminStats reference */
const stats = useAction(actions.admin.stats)
const create = useAction(createTodo)

async function failOnPurpose() {
  await create.execute({ title: '' })
}
</script>

<template>
  <div>
    <h1>Observability</h1>
    <h2>Global hooks: action:start / success / error / settled</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        These hooks fire for every <code>useAction</code>/<code>useOptimisticAction</code> call —
        one place to wire analytics, toasts, or logging. This page also calls the grouped
        namespace reference <code>actions.admin.stats</code>.
      </p>
    </section>

    <section style="display: flex; gap: 8px;">
      <button
        :disabled="stats.isExecuting.value"
        @click="stats.execute(undefined as never)"
      >
        Load admin stats (namespace)
      </button>
      <button @click="failOnPurpose">
        Trigger a validation error
      </button>
    </section>

    <section v-if="stats.data.value">
      <div class="success">
        users: {{ stats.data.value.users }} · served: {{ stats.data.value.actionsServed }} · uptime: {{ stats.data.value.uptime }}
      </div>
    </section>

    <section>
      <h2>Event log</h2>
      <pre v-if="events.length">{{ events.join('\n') }}</pre>
      <p
        v-else
        style="color: #666;"
      >
        Trigger an action to see hook events.
      </p>
    </section>
  </div>
</template>
