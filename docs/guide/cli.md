# CLI Scaffolding

`nuxt-actions` ships a small CLI to scaffold action files.

```bash
npx nuxt-actions add create-todo
npx nuxt-actions add list-todos --method get
npx nuxt-actions add ping --schema none
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--method` | `post` | `get`, `post`, `put`, `patch`, `delete`, or `head` |
| `--dir` | `server/actions` | Target directory |
| `--schema` | `zod` | `zod` for a validated input stub, `none` for no input |

The file name follows the framework convention: `post` actions are written as
`<name>.ts`, other methods as `<name>.<method>.ts`. The CLI refuses to overwrite an
existing file.

A `post` action named `create-todo` is written to `server/actions/create-todo.ts`,
served at `/api/_actions/create-todo`, and importable as `createTodo` from `#actions`.
