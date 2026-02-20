<template>
  <div>
    <h1>SSR Queries</h1>
    <h2>Server-rendered with reactive filtering</h2>

    <section>
      <input
        v-model="search"
        type="text"
        placeholder="Search todos..."
      >
    </section>

    <section>
      <div
        v-if="pending"
        style="color: #a3a3a3; font-size: 14px;"
      >
        Loading...
      </div>

      <div
        v-else-if="error"
        class="error"
      >
        {{ error.message }}
      </div>

      <div v-else-if="data">
        <p style="color: #666; font-size: 13px; margin-bottom: 12px;">
          {{ data.total }} result{{ data.total !== 1 ? 's' : '' }}
        </p>

        <div
          v-for="item in data.items"
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

        <div
          v-if="data.items.length === 0"
          style="color: #666; padding: 24px 0; text-align: center;"
        >
          No todos match "{{ search }}"
        </div>
      </div>
    </section>

    <section>
      <button @click="refresh">
        Refresh
      </button>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Debounced search
      </h3>
      <p style="color: #a3a3a3; font-size: 13px; margin-bottom: 12px;">
        You can also use <code>useAction</code> with the <code>debounce</code> option for manual control:
      </p>
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <input
          v-model="debouncedQuery"
          type="text"
          placeholder="Debounced search (300ms)..."
        >
        <span
          v-if="debouncedSearching"
          style="color: #60a5fa; font-size: 13px; align-self: center;"
        >searching...</span>
      </div>
      <pre
        v-if="debouncedResult"
        style="font-size: 12px;"
      >{{ JSON.stringify(debouncedResult, null, 2) }}</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { searchTodos } from '#actions'

// Reactive query with useActionQuery
const search = ref('')
const { data, pending, error, refresh } = useActionQuery(
  searchTodos,
  () => ({ q: search.value }),
)
// Re-fetches automatically when search changes

// Manual debounced search with useAction
const { execute, data: result, isExecuting } = useAction(
  searchTodos,
  { debounce: 300 },
)</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { searchTodos } from '#actions'

const search = ref('')

const { data, pending, error, refresh } = useActionQuery(
  searchTodos,
  () => ({ q: search.value }),
)

// Debounced search demo
const debouncedQuery = ref('')
const { execute: debouncedSearch, data: debouncedResult, isExecuting: debouncedSearching } = useAction(
  searchTodos,
  { debounce: 300 },
)

watch(debouncedQuery, (q) => {
  if (q) debouncedSearch({ q })
})
</script>
