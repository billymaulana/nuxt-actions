# Authentication

`defineAuthMiddleware` resolves the current user into `ctx.user`, or rejects with a 401.

```ts
import { defineAuthMiddleware } from '#imports'

const authed = createActionClient()
  .use(defineAuthMiddleware(event => getUserSession(event).then(s => s.user ?? null)))

export default authed
  .schema(z.object({ title: z.string() }))
  .action(async ({ input, ctx }) => {
    return { author: ctx.user.id, title: input.title }
  })
```

Pass `{ optional: true }` to allow anonymous requests (`ctx.user` is `null`). Works with
any session source — `nuxt-auth-utils`, a custom cookie, or a bearer token — through the
`resolve` function. A failed check returns the standard error envelope with code
`UNAUTHORIZED` and status 401.
