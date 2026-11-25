<template>
  <div>
    <h1>File Uploads</h1>
    <h2>multipart/form-data parsed into typed file fields</h2>

    <section>
      <p style="color: #a3a3a3; font-size: 14px;">
        <strong style="color: #e5e5e5;">The problem:</strong> a user uploads a profile picture.
        You need the file <em>and</em> the other form fields, type-checked, without hand-parsing
        the multipart body.
      </p>
      <p style="color: #a3a3a3; font-size: 14px; margin-top: 8px;">
        <strong style="color: #e5e5e5;">The fix:</strong> send a <code>FormData</code> to
        <code>execute()</code>. nuxt-actions parses each file part into a typed
        <code>{ filename, type, data }</code> field, and your handler validates the rest with Zod.
      </p>
      <p style="color: #a3a3a3; font-size: 14px; margin-top: 8px;">
        <code>uploadProgress: true</code> reports how much of the file has been sent. A small image on a fast
        connection finishes at once; throttle the network in your browser's developer tools to watch it move.
      </p>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        Upload an avatar
      </h3>
      <form
        style="display: flex; flex-direction: column; gap: 12px;"
        @submit.prevent="handleUpload"
      >
        <input
          v-model="label"
          type="text"
          placeholder="Label (e.g. your name)"
        >
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          style="padding: 8px 0; border: none;"
          @change="onFileChange"
        >
        <img
          v-if="preview"
          :src="preview"
          alt="preview"
          style="max-width: 120px; border-radius: 8px; border: 1px solid #333;"
        >
        <button
          type="submit"
          :disabled="uploadAction.isExecuting.value || !file"
          style="align-self: flex-start;"
        >
          {{ uploadAction.isExecuting.value ? 'Uploading…' : 'Upload' }}
        </button>
        <div
          v-if="uploadAction.uploadProgress.value"
          style="display: flex; align-items: center; gap: 8px;"
        >
          <progress
            :value="uploadAction.uploadProgress.value.percent ?? undefined"
            max="100"
            style="flex: 1;"
          />
          <span style="font-size: 13px; color: #a3a3a3;">
            {{ uploadAction.uploadProgress.value.percent ?? 0 }}% sent
          </span>
        </div>
      </form>

      <div
        v-if="uploadAction.error.value"
        class="error"
      >
        {{ uploadAction.error.value.message }}
      </div>

      <div
        v-if="uploadAction.data.value"
        class="success"
      >
        Uploaded <strong>{{ uploadAction.data.value.filename }}</strong>
        ({{ uploadAction.data.value.type }}, {{ uploadAction.data.value.humanSize }})
        for label "{{ uploadAction.data.value.label }}".
      </div>
    </section>

    <section>
      <h3 style="margin-bottom: 8px;">
        How it works
      </h3>
      <pre>// server/actions/upload-avatar.post.ts
export default defineAction({
  input: z.object({ label: z.string(), avatar: z.any().optional() }),
  handler: async ({ input }) => {
    const file = input.avatar as { filename: string, type: string, data: Buffer }
    return { filename: file.filename, size: file.data.length }
  },
})

// client
const { execute, uploadProgress } = useAction(uploadAvatar, { uploadProgress: true })
const fd = new FormData()
fd.append('label', label)
fd.append('avatar', file)
await execute(fd)</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { uploadAvatar } from '#actions'

const label = ref('')
const file = ref<File | null>(null)
const preview = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const uploadAction = useAction(uploadAvatar, { uploadProgress: true })

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const selected = target.files?.[0] ?? null
  file.value = selected
  preview.value = selected ? URL.createObjectURL(selected) : null
  if (selected && !label.value) label.value = selected.name
}

async function handleUpload() {
  if (!file.value) return
  const fd = new FormData()
  fd.append('label', label.value)
  fd.append('avatar', file.value)
  await uploadAction.execute(fd as never)
}
</script>
