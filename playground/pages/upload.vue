<script setup lang="ts">
import { ref } from 'vue'
import { upload } from '#actions'

const { execute, data } = useAction(upload)
const title = ref('demo')

async function submit(e: Event) {
  const form = e.target as HTMLFormElement
  const fd = new FormData(form)
  await execute(fd as never)
}
</script>

<template>
  <div>
    <form @submit.prevent="submit">
      <input
        name="title"
        :value="title"
      >
      <input
        name="file"
        type="file"
      >
      <button>Upload</button>
    </form>
    <pre v-if="data">{{ data }}</pre>
  </div>
</template>
