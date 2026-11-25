---
title: File Uploads
description: Upload an avatar as FormData. nuxt-actions parses the multipart body into typed fields, so the handler reads the file and the label together.
---

# File Uploads

Pass a `FormData` to `execute()` and the request goes out as `multipart/form-data`. On the server, nuxt-actions turns each file part into a `{ filename, type, data }` object and leaves text parts as strings, then validates the whole object with your schema. The handler gets the file and the other fields together, without parsing the body by hand.

<ExampleSource page="pages/uploads.vue" />

## Server action

```ts [server/actions/upload-avatar.post.ts]
import { z } from 'zod'

export default defineAction({
  input: z.object({
    label: z.string().min(1, 'Label is required'),
    avatar: z.any().optional(),
  }),
  handler: async ({ input }) => {
    const file = input.avatar as
      | { filename?: string, type?: string, data?: { length: number } }
      | undefined

    if (!file?.filename) {
      throw createActionError({
        code: 'NO_FILE',
        message: 'No file was uploaded',
        statusCode: 400,
      })
    }

    const size = file.data?.length ?? 0
    return {
      label: input.label,
      filename: file.filename,
      type: file.type ?? 'application/octet-stream',
      size,
      humanSize: size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`,
    }
  },
})
```

## Page

```vue [pages/uploads.vue]
<script setup lang="ts">
import { ref } from 'vue'
import { uploadAvatar } from '#actions'

const label = ref('')
const file = ref<File | null>(null)
const preview = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const uploadAction = useAction(uploadAvatar)

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

<template>
  <div>
    <section>
      <form @submit.prevent="handleUpload">
        <input v-model="label" type="text" placeholder="Label (e.g. your name)">
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          @change="onFileChange"
        >
        <img v-if="preview" :src="preview" alt="preview">
        <button type="submit" :disabled="uploadAction.isExecuting.value || !file">
          {{ uploadAction.isExecuting.value ? 'Uploading…' : 'Upload' }}
        </button>
      </form>

      <div v-if="uploadAction.error.value" class="error">
        {{ uploadAction.error.value.message }}
      </div>

      <div v-if="uploadAction.data.value" class="success">
        Uploaded <strong>{{ uploadAction.data.value.filename }}</strong>
        ({{ uploadAction.data.value.type }}, {{ uploadAction.data.value.humanSize }})
        for label "{{ uploadAction.data.value.label }}".
      </div>
    </section>
  </div>
</template>
```

The markup is trimmed for readability. The full page is linked above.

## How it works

- `handleUpload` puts the label and the selected file into a `FormData` under `label` and `avatar`, and passes it straight to `execute()`.
- The `as never` cast is there because the action's input type describes the parsed object, not the `FormData` the browser sends.
- The schema checks `label` and accepts any value for `avatar`. The handler narrows `avatar` to the parsed file shape and rejects the request with `NO_FILE` and status 400 when no file arrived.
- `file.data` holds the file's bytes, so `data.length` is its size in bytes.
- `URL.createObjectURL` shows a preview before anything is uploaded, and the label defaults to the file name.

## Related

- Guide: [File Uploads](/guide/file-uploads)
- API: [defineAction](/api/define-action), [useAction](/api/use-action)
