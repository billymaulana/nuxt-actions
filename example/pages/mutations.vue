<template>
  <div>
    <h1>Smart Cache Invalidation</h1>
    <h2>useActionMutation + tags — write once, every affected query refetches</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        <strong style="color: #e5e5e5;">The problem:</strong> after you add, toggle, or delete a task,
        the list <em>and</em> the stats panel both go stale. Manually wiring a refetch after every
        mutation is error-prone and easy to forget.
      </p>
      <p style="color: #a3a3a3; font-size: 14px; margin-top: 8px;">
        <strong style="color: #e5e5e5;">The fix:</strong> both queries register the
        <code>'tasks'</code> tag. Each mutation declares <code>invalidates: ['tasks']</code>, so a
        successful write auto-refetches every query under that tag — no manual plumbing.
      </p>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Stats
      </h3>
      <div style="display: flex; gap: 12px;">
        <span
          class="badge"
          style="background: #1e3a5f; color: #60a5fa;"
        >Total: {{ stats?.total ?? 0 }}</span>
        <span
          class="badge"
          style="background: #0a2c0a; color: #4ade80;"
        >Done: {{ stats?.done ?? 0 }}</span>
        <span
          class="badge"
          style="background: #2c1a0a; color: #fb923c;"
        >Pending: {{ stats?.pending ?? 0 }}</span>
        <span
          v-if="statsStatus === 'pending'"
          style="color: #666; font-size: 12px;"
        >refetching…</span>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Add a task
      </h3>
      <form
        style="display: flex; gap: 8px;"
        @submit.prevent="handleAdd"
      >
        <input
          v-model="newTitle"
          type="text"
          placeholder="What needs doing?"
          style="flex: 1;"
        >
        <button
          type="submit"
          :disabled="addMutation.isExecuting.value"
        >
          {{ addMutation.isExecuting.value ? 'Adding…' : 'Add' }}
        </button>
      </form>
      <div
        v-if="addMutation.error.value"
        class="error"
      >
        {{ addMutation.error.value.message }}
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Tasks
        <span
          v-if="listStatus === 'pending'"
          style="color: #666; font-size: 12px; font-weight: normal;"
        >refetching…</span>
      </h3>
      <div
        v-for="task in tasks"
        :key="task.id"
        style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #222;"
      >
        <input
          type="checkbox"
          :checked="task.done"
          style="width: auto;"
          @change="handleToggle(task.id)"
        >
        <span
          style="flex: 1;"
          :style="{ textDecoration: task.done ? 'line-through' : 'none', color: task.done ? '#666' : '#e5e5e5' }"
        >
          {{ task.title }}
        </span>
        <button
          style="background: #2c1010; color: #f87171; padding: 4px 10px;"
          @click="handleDelete(task.id)"
        >
          Delete
        </button>
      </div>
      <p
        v-if="tasks.length === 0"
        style="color: #666; padding: 12px 0;"
      >
        No tasks — add one above.
      </p>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { listTasks, taskStats, addTask } from '#actions'

// Two queries share one tag
const { data: list } = useActionQuery(listTasks, undefined, { tags: ['tasks'] })
const { data: stats } = useActionQuery(taskStats, undefined, { tags: ['tasks'] })

// One mutation invalidates the tag — both queries refetch
const add = useActionMutation(addTask, { invalidates: ['tasks'] })
await add.execute({ title })</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { listTasks, taskStats, addTask, toggleTask, deleteTask } from '#actions'

const { data: listData, status: listStatus } = useActionQuery(listTasks, undefined, { tags: ['tasks'] })
const { data: stats, status: statsStatus } = useActionQuery(taskStats, undefined, { tags: ['tasks'] })

const tasks = computed(() => listData.value?.items ?? [])

const newTitle = ref('')

const addMutation = useActionMutation(addTask, { invalidates: ['tasks'] })
const toggleMutation = useActionMutation(toggleTask, { invalidates: ['tasks'] })
const deleteMutation = useActionMutation(deleteTask, { invalidates: ['tasks'] })

async function handleAdd() {
  if (!newTitle.value) return
  const result = await addMutation.execute({ title: newTitle.value })
  if (result.success) newTitle.value = ''
}

async function handleToggle(id: number) {
  await toggleMutation.execute({ id })
}

async function handleDelete(id: number) {
  await deleteMutation.execute({ id })
}
</script>
