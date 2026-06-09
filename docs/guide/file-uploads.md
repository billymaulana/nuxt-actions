# File Uploads

Send a `FormData` body to an action and it is parsed into your input object. Fields
with a file become `ActionFile` (`{ filename, type, data: Buffer }`); text fields stay
strings.

```ts
// server/actions/upload.post.ts
export default defineAction({
  input: z.object({ title: z.string(), file: z.any() }),
  handler: async ({ input }) => {
    const file = input.file as ActionFile
    return { name: file.filename, size: file.data.length }
  },
})
```

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
