<script setup lang="ts">
import { ref } from 'vue'
import { pay } from '#actions'

const amount = ref(150)
const recipient = ref('Coffee Shop')
const idempotencyKey = ref(crypto.randomUUID())
const log = ref<string[]>([])

const { execute, isExecuting, error } = useAction(pay, {
  headers: () => ({ 'Idempotency-Key': idempotencyKey.value }),
})

async function submit() {
  const result = await execute({ amount: amount.value, recipient: recipient.value })
  if (result.success) {
    log.value.unshift(`${result.data.txId} — ${result.data.amount} to ${result.data.recipient} (${result.data.processedAt})`)
  }
  else {
    log.value.unshift(`ERROR ${result.error.code}: ${result.error.message}`)
  }
}

function newKey() {
  idempotencyKey.value = crypto.randomUUID()
}
</script>

<template>
  <div>
    <h1>Idempotency</h1>
    <h2>Spam the pay button — the handler runs once per key</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        The action is defined with <code>idempotency: { ttl: 60_000 }</code>. Every request carries an
        <code>Idempotency-Key</code> header. Duplicate clicks replay the stored result — the same
        <code>txId</code> comes back and no second charge happens. Change the amount with the same key
        to see the 422 conflict.
      </p>
    </section>

    <section style="display: flex; flex-direction: column; gap: 8px;">
      <input
        v-model.number="amount"
        type="number"
        placeholder="Amount"
      >
      <input
        v-model="recipient"
        placeholder="Recipient"
      >
      <div style="display: flex; gap: 8px;">
        <button
          :disabled="isExecuting"
          @click="submit"
        >
          {{ isExecuting ? 'Processing…' : 'Pay now' }}
        </button>
        <button @click="newKey">
          New idempotency key
        </button>
      </div>
      <p style="color: #666; font-size: 12px;">
        key: {{ idempotencyKey }}
      </p>
    </section>

    <section>
      <div
        v-if="error"
        class="error"
      >
        {{ error.code }}: {{ error.message }}
      </div>
      <h2>Result log</h2>
      <pre v-if="log.length">{{ log.join('\n') }}</pre>
      <p
        v-else
        style="color: #666;"
      >
        No payments yet.
      </p>
    </section>
  </div>
</template>
