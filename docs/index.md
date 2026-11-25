---
layout: home
markdownStyles: false
title: Type-safe server actions for Nuxt
description: Define a validated server action once and call it from any Nuxt component with input and output types inferred end to end. Works with Zod, Valibot, and ArkType on Nitro v2 and Nitro v3.
---

<HomeHero />

<HomeStack />

<HomeFeatures />

<section class="home-block" aria-labelledby="example-title">
<div v-reveal class="section-head">
<div class="eyebrow"><span class="eyebrow-pill">Quick start</span></div>
<h2 id="example-title" class="section-title">Two files. No glue code.</h2>
<p class="section-lead">The file name becomes the endpoint, and <code>#actions</code> hands the component a typed reference to it.</p>
</div>
<div class="example-grid">
<div v-reveal class="example-step vp-doc">

**1. Create** `server/actions/create-todo.ts`

```ts
import { z } from 'zod'

export default defineAction({
  input: z.object({
    title: z.string().min(1, 'Title is required'),
  }),
  handler: async ({ input }) => {
    return { id: Date.now(), title: input.title }
  },
})
```

</div>
<div v-reveal class="example-step vp-doc">

**2. Call it** from `app/pages/todos.vue`

```vue
<script setup lang="ts">
import { createTodo } from '#actions'

const { execute, data, error } = useAction(createTodo)
</script>

<template>
  <button @click="execute({ title: 'Buy milk' })">
    Add todo
  </button>
  <p v-if="data">Created {{ data.title }}</p>
  <p v-if="error">{{ error.message }}</p>
</template>
```

</div>
</div>
</section>

<HomeCallToAction />
