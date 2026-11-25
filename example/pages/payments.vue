<template>
  <div>
    <h1>Idempotent Payments</h1>
    <h2>Double-clicking "Pay" never double-charges</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        <strong style="color: #e5e5e5;">The problem:</strong> a user mashes the Pay button, or a flaky
        mobile connection retries the request — and the customer gets charged twice.
      </p>
      <p style="color: #a3a3a3; font-size: 14px; margin-top: 8px;">
        <strong style="color: #e5e5e5;">The fix:</strong> the action is defined with
        <code>idempotency: { ttl: 60_000 }</code>. Each request carries an <code>Idempotency-Key</code>;
        duplicates replay the stored result (same <code>txId</code>, one charge). Spam the button — the log
        proves the handler ran once. Change the amount with the same key to see the 422 conflict.
      </p>
    </section>

    <section style="display: flex; flex-direction: column; gap: 8px;">
      <label style="font-size: 13px; color: #a3a3a3;">Amount</label>
      <input
        v-model.number="amount"
        type="number"
      >
      <label style="font-size: 13px; color: #a3a3a3;">Recipient</label>
      <input v-model="recipient">
      <div style="display: flex; gap: 8px; margin-top: 8px;">
        <button
          :disabled="pay.isExecuting.value"
          @click="submit"
        >
          {{ pay.isExecuting.value ? 'Processing…' : 'Pay now' }}
        </button>
        <button @click="newKey">
          New payment (fresh key)
        </button>
      </div>
      <p style="color: #666; font-size: 12px;">
        Idempotency-Key: {{ idempotencyKey }}
      </p>
    </section>

    <section>
      <div
        v-if="pay.error.value"
        class="error"
      >
        {{ pay.error.value.code }}: {{ pay.error.value.message }}
      </div>
      <h2>Charge log</h2>
      <pre v-if="log.length">{{ log.join('\n') }}</pre>
      <p
        v-else
        style="color: #666;"
      >
        No charges yet.
      </p>
    </section>

    <section>
      <h2>How it works</h2>
      <pre>// server/actions/pay.post.ts
export default defineAction({
  input: z.object({ amount: z.number().positive(), recipient: z.string() }),
  idempotency: { ttl: 60_000 },
  handler: async ({ input }) => charge(input),
})

// client — same key for retries of the same logical payment
useAction(pay, { headers: () => ({ 'Idempotency-Key': key.value }) })</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { pay as payAction } from '#actions'

const amount = ref(150)
const recipient = ref('Coffee Shop')
const idempotencyKey = useState('payment-idempotency-key', () => crypto.randomUUID())
const log = ref<string[]>([])

const pay = useAction(payAction, {
  headers: () => ({ 'Idempotency-Key': idempotencyKey.value }),
})

async function submit() {
  const result = await pay.execute({ amount: amount.value, recipient: recipient.value })
  if (result.success) {
    log.value.unshift(`${result.data.txId} — $${result.data.amount} to ${result.data.recipient}`)
  }
  else if (isActionError(result.error)) {
    log.value.unshift(`✗ ${result.error.code}: ${result.error.message}`)
  }
}

function newKey() {
  idempotencyKey.value = crypto.randomUUID()
}
</script>
