---
description: "Accept file uploads in actions: send FormData and receive typed ActionFile fields with the file name, content type, and data."
---

# File Uploads

Send a `FormData` body to an action and it is parsed into your input object. Fields
with a file become `ActionFile` (`{ filename, type, data: Buffer }`); text fields stay
strings.

```ts
// server/actions/upload.post.ts
const fileSchema = z.custom<ActionFile>(
  value => typeof value === 'object' && value !== null && 'filename' in value && 'data' in value,
  'Expected a file',
)

export default defineAction({
  input: z.object({ title: z.string(), file: fileSchema }),
  handler: async ({ input }) => {
    return { name: input.file.filename, size: input.file.data.length }
  },
})
```

`ActionFile` is auto-imported in server code. Validating the field with `z.custom<ActionFile>()` types `input.file` without a cast and rejects a request that has no file with a `VALIDATION_ERROR`. Add `.optional()` when the file is not required.

```ts
// client
const { execute } = useAction(upload)
const fd = new FormData()
fd.append('title', 'hi')
fd.append('file', fileInput.files[0])
await execute(fd)
```

The client needs no special handling — `FormData` is sent as `multipart/form-data`
automatically. Repeated field names collect into an array. Validate files with your
schema as needed; the module does not impose size or type checks.

## Upload Progress

`fetch` cannot report how much of a body has been sent. Turn on `uploadProgress` and, in the browser, `useAction` sends the request through `XMLHttpRequest`, which can:

```vue
<script setup lang="ts">
import { upload } from '#actions'

const { execute, uploadProgress, isExecuting } = useAction(upload, { uploadProgress: true })

async function send(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const form = new FormData()
  form.append('title', file.name)
  form.append('file', file)
  await execute(form)
}
</script>

<template>
  <input type="file" :disabled="isExecuting" @change="send">
  <progress v-if="uploadProgress" :value="uploadProgress.percent ?? undefined" max="100" />
</template>
```

`uploadProgress` is `{ loaded, total, percent }`: the bytes sent, the size of the body, and a whole-number percentage. `total` and `percent` are `null` while the size is not known, and a `<progress>` element without a value shows as indeterminate. The value stays after the upload finishes, and `reset()` clears it. Pass `onUploadProgress` to get each update as a callback.

`$fetch` options still apply: `baseURL`, headers, retry, timeout, and `cancel()`, which aborts the upload. On the server, and in a browser without `XMLHttpRequest`, the request goes through `fetch` and `uploadProgress` stays `null`. The option is available on `useAction` and `useActionMutation`; `useFormAction` sends JSON, so it never uploads files.
