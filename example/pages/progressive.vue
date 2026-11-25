<template>
  <div>
    <h1>Progressive Enhancement</h1>
    <h2>useActionState for forms that work with and without JavaScript</h2>

    <section>
      <h3 style="margin-bottom: 8px;">
        Create Todo (Progressive)
      </h3>
      <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
        This form uses <code>formProps</code> for native HTML fallback and <code>formAction(FormData)</code> for JS-enhanced submission.
      </p>
      <form
        v-bind="formProps"
        @submit.prevent="handleSubmit"
      >
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 13px; color: #a3a3a3; margin-bottom: 4px;">Title</label>
          <input
            name="title"
            type="text"
            placeholder="Enter todo title..."
            style="width: 100%;"
          >
        </div>

        <button
          type="submit"
          :disabled="pending"
        >
          {{ pending ? 'Creating...' : 'Create Todo' }}
        </button>
      </form>

      <div
        v-if="error"
        class="error"
      >
        {{ error.message }}
        <pre v-if="error.fieldErrors">{{ JSON.stringify(error.fieldErrors, null, 2) }}</pre>
      </div>

      <div
        v-if="state"
        class="success"
      >
        <p>Created todo:</p>
        <pre>{{ JSON.stringify(state, null, 2) }}</pre>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        State
      </h3>
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px;">
        <span style="color: #a3a3a3;">pending:</span>
        <span :style="{ color: pending ? '#60a5fa' : '#666' }">{{ pending }}</span>
        <span style="color: #a3a3a3;">state:</span>
        <span>{{ state ? JSON.stringify(state) : 'null' }}</span>
        <span style="color: #a3a3a3;">error:</span>
        <span :style="{ color: error ? '#f87171' : '#666' }">{{ error ? error.message : 'null' }}</span>
        <span style="color: #a3a3a3;">formProps:</span>
        <span style="color: #4ade80;">{{ JSON.stringify(formProps) }}</span>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Try It
      </h3>
      <div style="background: #111; padding: 12px; border-radius: 6px; font-size: 13px; color: #a3a3a3;">
        <p>Enter <code>"Buy milk"</code> or <code>"Walk dog"</code> to trigger a server-side validation error via <code>returnValidationErrors</code>.</p>
        <p style="margin-top: 4px;">
          Submit empty to see Zod validation.
        </p>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { createValidatedTodo } from '#actions'

const { state, error, pending, formAction, formProps } =
  useActionState(createValidatedTodo)

// Template:
// &lt;form v-bind="formProps"
//       @submit.prevent="formAction(new FormData($event.target))"&gt;
//   &lt;input name="title" /&gt;
//   &lt;button :disabled="pending"&gt;Create&lt;/button&gt;
// &lt;/form&gt;

// formProps provides { action, method } for native
// HTML form submission when JS is disabled.
// formAction converts FormData to plain object and
// executes the action with full type safety.</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { createValidatedTodo } from '#actions'

const { state, error, pending, formAction, formProps } = useActionState(createValidatedTodo)

async function handleSubmit(e: Event) {
  const form = e.target as HTMLFormElement
  await formAction(new FormData(form))
  if (!error.value) {
    form.reset()
  }
}
</script>
