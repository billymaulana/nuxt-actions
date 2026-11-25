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
