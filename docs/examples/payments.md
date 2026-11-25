---
title: Idempotent Payments
description: Make a payment action safe to retry with the idempotency option. Duplicate requests replay the stored result, and a changed payload gets a 422.
---

# Idempotent Payments

A double click or a retried mobile request should never charge a customer twice. The `pay` action sets `idempotency: { ttl: 60_000 }`, and the page sends an `Idempotency-Key` header with every call. The server stores the first result for a key and replays it for duplicates, so the handler runs once per key.

<ExampleSource page="pages/payments.vue" />

## Server action

```ts [server/actions/pay.post.ts]
import { z } from 'zod'

let txCounter = 1000

export default defineAction({
  input: z.object({
    amount: z.number().positive(),
    recipient: z.string().min(1),
  }),
  idempotency: { ttl: 60_000 },
  handler: async ({ input }) => {
    await new Promise(resolve => setTimeout(resolve, 600))
    txCounter++
    return {
      txId: `TX-${txCounter}`,
      amount: input.amount,
      recipient: input.recipient,
      chargedAt: new Date().toISOString(),
    }
  },
})
```

## Page

```vue [pages/payments.vue]
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
    log.value.unshift(
      `${result.data.txId} — $${result.data.amount} to ${result.data.recipient}`,
    )
  }
  else if (isActionError(result.error)) {
    log.value.unshift(`✗ ${result.error.code}: ${result.error.message}`)
  }
}

function newKey() {
  idempotencyKey.value = crypto.randomUUID()
}
</script>

<template>
  <div>
    <section>
      <label>Amount</label>
      <input v-model.number="amount" type="number">
      <label>Recipient</label>
      <input v-model="recipient">
      <button :disabled="pay.isExecuting.value" @click="submit">
        {{ pay.isExecuting.value ? 'Processing…' : 'Pay now' }}
      </button>
      <button @click="newKey">
        New payment (fresh key)
      </button>
      <p>Idempotency-Key: {{ idempotencyKey }}</p>
    </section>

    <section>
      <div v-if="pay.error.value" class="error">
        {{ pay.error.value.code }}: {{ pay.error.value.message }}
      </div>
      <h2>Charge log</h2>
      <pre v-if="log.length">{{ log.join('\n') }}</pre>
      <p v-else>
        No charges yet.
      </p>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- The key lives in a ref and goes out through a `headers` function, so every retry of the same payment carries the same key.
- The first request with a key runs the handler and stores its result for 60 seconds. A repeat with the same key and the same input gets the stored result back, with the same `txId`, and the handler does not run again.
- A duplicate that arrives while the first request is still running waits for it instead of starting a second charge.
- Changing the amount and paying again with the same key returns `IDEMPOTENCY_KEY_REUSE` with status 422, because the payload no longer matches the stored one.
- "New payment" creates a fresh key with `crypto.randomUUID()`, which starts a new logical payment.

## Related

- Guide: [Idempotency](/guide/idempotency)
- API: [Idempotency](/api/idempotency), [defineAction](/api/define-action)
