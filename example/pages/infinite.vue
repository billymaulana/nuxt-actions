<template>
  <div>
    <h1>Infinite Scroll</h1>
    <h2>useInfiniteActionQuery with cursor-based pagination</h2>

    <section>
      <h3 style="margin-bottom: 8px;">
        Paginated Todos
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 12px;">
        Loads 5 items per page from a list of 20. Click "Load More" to fetch the next page.
      </p>

      <div
        v-if="pending && pages.length === 0"
        style="color: #a3a3a3; font-size: 14px;"
      >
        Loading first page...
      </div>

      <div v-else>
        <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
          {{ pages.length }} page(s) loaded
        </p>

        <div
          v-for="(page, pageIndex) in pages"
          :key="pageIndex"
        >
          <div
            style="font-size: 11px; color: #60a5fa; padding: 4px 0; margin-top: 8px;"
          >
            Page {{ pageIndex + 1 }}
          </div>
          <div
            v-for="item in (page as PageData).items"
            :key="item.id"
            style="padding: 8px 0; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 8px;"
          >
            <span style="color: #a3a3a3; font-size: 12px; min-width: 28px;">
              #{{ item.id }}
            </span>
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
      </div>
    </section>

    <section>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button
          v-if="hasNextPage"
          :disabled="isFetchingNextPage"
          @click="fetchNextPage"
        >
          {{ isFetchingNextPage ? 'Loading...' : 'Load More' }}
        </button>
        <span
          v-else
          style="color: #4ade80; font-size: 13px;"
        >
          All items loaded
        </span>
        <button @click="refresh">
          Reset
        </button>
      </div>
    </section>

    <section v-if="error">
      <div class="error">
        {{ error.message }}
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { paginatedTodos } from '#actions'

const {
  pages,
  data,
  pending,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  refresh,
} = useInfiniteActionQuery(
  paginatedTodos,
  undefined,
  {
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  },
)</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { paginatedTodos } from '#actions'

interface PageData {
  items: Array<{ id: number, title: string, done: boolean }>
  nextPage: number | null
}

const {
  pages,
  pending,
  error,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  refresh,
} = useInfiniteActionQuery(
  paginatedTodos,
  undefined,
  {
    initialPageParam: 1,
    getNextPageParam: lastPage => (lastPage as PageData).nextPage ?? undefined,
  },
)
</script>
