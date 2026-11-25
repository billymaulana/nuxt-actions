<template>
  <div>
    <h1>Polling & Query Options</h1>
    <h2>useActionQuery v1.1.0 features: refetchInterval, refetchOnFocus, enabled, transform</h2>

    <section>
      <h3 style="margin-bottom: 8px;">
        refetchInterval (auto-refresh every 2s)
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Server time updates automatically every 2 seconds via polling.
      </p>
      <div
        v-if="timePending"
        style="color: #a3a3a3; font-size: 14px;"
      >
        Loading...
      </div>
      <div
        v-else-if="timeData"
        style="padding: 12px; background: #111; border-radius: 6px;"
      >
        <p style="font-size: 14px; color: #e5e5e5;">
          Server time: <strong>{{ timeData.time }}</strong>
        </p>
        <p style="font-size: 12px; color: #666; margin-top: 4px;">
          Timestamp: {{ timeData.timestamp }}
        </p>
      </div>
      <pre>import { currentTime } from '#actions'

const { data } = useActionQuery(currentTime, undefined, {
  refetchInterval: 2000,
})</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        refetchOnFocus
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Switch to another tab and come back — the todo list will refresh automatically.
      </p>
      <div
        v-if="focusPending"
        style="color: #a3a3a3; font-size: 14px;"
      >
        Loading...
      </div>
      <div v-else-if="focusData">
        <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
          {{ focusData.items.length }} todo(s) loaded — last refreshed when tab gained focus
        </p>
        <div
          v-for="item in focusData.items"
          :key="item.id"
          style="padding: 8px 0; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 8px;"
        >
          <span :style="{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? '#666' : '#e5e5e5', flex: 1 }">
            {{ item.title }}
          </span>
          <span
            class="badge"
            :style="{ background: item.done ? '#0a2c0a' : '#2c1a0a', color: item.done ? '#4ade80' : '#fb923c' }"
          >
            {{ item.done ? 'Done' : 'Pending' }}
          </span>
        </div>
      </div>
      <pre>import { listTodos } from '#actions'

const { data } = useActionQuery(listTodos, undefined, {
  refetchOnFocus: true,
})</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        enabled (toggle fetching)
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Toggle the switch to enable/disable fetching. Data only loads when enabled is true.
      </p>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
        <button @click="fetchEnabled = !fetchEnabled">
          {{ fetchEnabled ? 'Disable fetching' : 'Enable fetching' }}
        </button>
        <span style="font-size: 13px; color: #a3a3a3;">
          enabled: <strong :style="{ color: fetchEnabled ? '#4ade80' : '#f87171' }">{{ fetchEnabled }}</strong>
        </span>
      </div>
      <div
        v-if="enabledPending"
        style="color: #a3a3a3; font-size: 14px;"
      >
        Loading...
      </div>
      <div
        v-else-if="enabledData"
        class="success"
      >
        Fetched {{ enabledData.items.length }} todo(s)
      </div>
      <div
        v-else
        style="color: #666; font-size: 14px;"
      >
        Fetching disabled — no data loaded
      </div>
      <pre>const fetchEnabled = ref(false)

const { data } = useActionQuery(listTodos, undefined, {
  enabled: fetchEnabled,
})</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        transform
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        Transform the response before it reaches the template. Here we reverse the order and add an index.
      </p>
      <div
        v-if="transformPending"
        style="color: #a3a3a3; font-size: 14px;"
      >
        Loading...
      </div>
      <div v-else-if="transformData">
        <div
          v-for="item in transformData"
          :key="item.id"
          style="padding: 8px 0; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 8px;"
        >
          <span style="color: #60a5fa; font-size: 12px; min-width: 24px;">
            #{{ item.index }}
          </span>
          <span :style="{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? '#666' : '#e5e5e5', flex: 1 }">
            {{ item.title }}
          </span>
        </div>
      </div>
      <pre>const { data } = useActionQuery(searchTodos, () => ({ q: '' }), {
  transform: (result) =>
    result.items.reverse().map((item, i) => ({
      ...item,
      index: i + 1,
    })),
})</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { currentTime, listTodos, searchTodos } from '#actions'

// ── refetchInterval ──
const { data: timeData, pending: timePending } = useActionQuery(
  currentTime,
  undefined,
  { refetchInterval: 2000 },
)

// ── refetchOnFocus ──
const { data: focusData, pending: focusPending } = useActionQuery(
  listTodos,
  undefined,
  { refetchOnFocus: true },
)

// ── enabled toggle ──
const fetchEnabled = ref(false)
const { data: enabledData, pending: enabledPending } = useActionQuery(
  listTodos,
  undefined,
  { enabled: fetchEnabled },
)

// ── transform ──
const { data: transformData, pending: transformPending } = useActionQuery(
  searchTodos,
  () => ({ q: '' }),
  {
    transform: (result: { items: Array<{ id: number, title: string, done: boolean }>, total: number }) =>
      [...result.items].reverse().map((item, i) => ({
        ...item,
        index: i + 1,
      })),
  },
)
</script>
