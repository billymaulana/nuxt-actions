---
description: "API reference for callAction: run an action from an API route, server middleware, or another action, with validation and middleware and no HTTP round trip."
---

# callAction()

Runs an action from server code, such as an API route, server middleware, or another action. The input is validated, the action's middleware runs, and the output is validated, as for a request to the action's route, but without an HTTP round trip.

## Type Signature

```ts
function callAction<TAction extends ServerAction>(
  event: ServerEvent,
  action: TAction,
  ...input: ActionInputArgs<TAction['_types']['input']>
): Promise<ActionResult<TAction['_types']['output']>>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `ServerEvent` | The current request event. The action's middleware runs with it. |
| `action` | `ServerAction<TInput, TOutput>` | The default export of a `defineAction` or `createActionClient` file |
| `input` | `TInput` | The input, before validation. Leave it out for an action without input. |

The input and output types come from the action alone, so `callAction(event, createTodo, { title: 1 })` is a type error when `title` must be a string, and so is a value that may lack a required field.

---

## Behavior

- Runs the same steps as the route: input validation, middleware, handler, output validation.
- Skips the steps that belong to an HTTP request: body parsing (you pass the input), [idempotency](/guide/idempotency) replay, and the [server cache](/guide/caching). A nested call never replays a result stored for the outer request's `Idempotency-Key`.
- Middleware sees the event you pass, with its headers, cookies, and `event.context`, so an auth middleware checks the caller of the outer request.
- Failures resolve as `{ success: false, error }`, the result the client would get. `callAction` does not throw for validation, middleware, or handler errors.
- Stream actions are not supported. Passing one is a type error, and throws a `TypeError` at runtime.

::: warning Mutations behind a GET route
`originMiddleware` and `csrfMiddleware` check the request's method, and only mutations are checked. When `callAction` runs an action from a GET route or from server middleware, the action's middleware sees that outer request, so a mutation reached that way is not protected. Expose a mutation only through a POST, PUT, PATCH, or DELETE route.
:::

`callAction` costs what the action itself costs; it adds no allocation beyond the result.

---

## Examples

### Reuse an Action in an API Route

```ts
// server/api/reports.post.ts
import createReport from '~~/server/actions/reports/create.post'

export default defineEventHandler(async (event) => {
  const result = await callAction(event, createReport, await readBody<{ month: string }>(event))
  if (!result.success) {
    throw createError({ statusCode: result.error.statusCode, statusMessage: result.error.message })
  }
  return result.data
})
```

The route is a POST, like the action it calls, so the action's CSRF or origin middleware still checks the request.

### Call One Action From Another

```ts
// server/actions/users/invite.post.ts
import sendEmail from '../emails/send.post'

export default defineAction({
  input: z.object({ email: z.string().email() }),
  handler: async ({ input, event }) => {
    const user = await db.users.invite(input.email)
    const sent = await callAction(event, sendEmail, { to: user.email, template: 'invite' })
    return { id: user.id, emailed: sent.success }
  },
})
```

### An Action Without Input

```ts
import listTodos from '~~/server/actions/todos/list.get'

const result = await callAction(event, listTodos)
```

---

## Auto-Import

`callAction` is auto-imported in the `server/` directory when the module is installed.

## See Also

- [defineAction](/api/define-action) -- Define a server action
- [Server Runtimes](/guide/server-runtimes) -- The `ServerEvent` type on each runtime
