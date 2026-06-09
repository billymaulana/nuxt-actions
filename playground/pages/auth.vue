<script setup lang="ts">
import { whoami } from '#actions'

const anon = useAction(whoami)
const authed = useAction(whoami, { headers: { 'x-user-id': 'u_42' } })
</script>

<template>
  <div>
    <h2>Auth Preset (defineAuthMiddleware)</h2>
    <button @click="anon.execute()">
      Call without header (expect 401)
    </button>
    <button @click="authed.execute()">
      Call with x-user-id header
    </button>
    <pre v-if="anon.error.value">anon error: {{ anon.error.value }}</pre>
    <pre v-if="authed.data.value">authed data: {{ authed.data.value }}</pre>
  </div>
</template>
