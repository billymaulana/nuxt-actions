<template>
  <div>
    <h1>Form Actions</h1>
    <h2>Field-level errors, dirty tracking, and reset</h2>

    <section>
      <form @submit.prevent="submit()">
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 13px; color: #a3a3a3; margin-bottom: 4px;">Name</label>
          <input
            v-model="fields.name"
            placeholder="Your name"
            style="width: 100%;"
          >
          <span
            v-if="fieldErrors.name"
            class="field-error"
          >{{ fieldErrors.name[0] }}</span>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 13px; color: #a3a3a3; margin-bottom: 4px;">Email</label>
          <input
            v-model="fields.email"
            type="email"
            placeholder="you@example.com"
            style="width: 100%;"
          >
          <span
            v-if="fieldErrors.email"
            class="field-error"
          >{{ fieldErrors.email[0] }}</span>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 13px; color: #a3a3a3; margin-bottom: 4px;">Password</label>
          <input
            v-model="fields.password"
            type="password"
            placeholder="Min 8 characters"
            style="width: 100%;"
          >
          <span
            v-if="fieldErrors.password"
            class="field-error"
          >{{ fieldErrors.password[0] }}</span>
        </div>

        <div style="display: flex; gap: 8px;">
          <button
            type="submit"
            :disabled="isSubmitting || !isDirty"
          >
            {{ isSubmitting ? 'Registering...' : 'Register' }}
          </button>
          <button
            type="button"
            :disabled="!isDirty"
            @click="reset()"
          >
            Reset
          </button>
        </div>
      </form>
    </section>

    <section
      v-if="error && !error.fieldErrors"
      class="error"
    >
      {{ error.message }}
    </section>

    <section v-if="data">
      <h3 style="color: #4ade80; margin-bottom: 8px;">
        Registered!
      </h3>
      <pre>{{ JSON.stringify(data, null, 2) }}</pre>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        State
      </h3>
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px;">
        <span style="color: #a3a3a3;">isDirty:</span>
        <span :style="{ color: isDirty ? '#fb923c' : '#666' }">{{ isDirty }}</span>
        <span style="color: #a3a3a3;">isSubmitting:</span>
        <span :style="{ color: isSubmitting ? '#60a5fa' : '#666' }">{{ isSubmitting }}</span>
        <span style="color: #a3a3a3;">status:</span>
        <span>{{ status }}</span>
        <span style="color: #a3a3a3;">fieldErrors:</span>
        <span>{{ Object.keys(fieldErrors).length > 0 ? JSON.stringify(fieldErrors) : '{}' }}</span>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>import { register } from '#actions'

const {
  fields, submit, fieldErrors,
  isDirty, isSubmitting, reset,
  data, error, status,
} = useFormAction(register, {
  initialValues: { name: '', email: '', password: '' },
})

// Try submitting with "taken@example.com" to see
// field-level validation errors from the server</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { register } from '#actions'

const {
  fields,
  submit,
  fieldErrors,
  isDirty,
  isSubmitting,
  reset,
  data,
  error,
  status,
} = useFormAction(register, {
  initialValues: { name: '', email: '', password: '' },
})
</script>

<style scoped>
.field-error {
  display: block;
  color: #f87171;
  font-size: 12px;
  margin-top: 4px;
}
</style>
