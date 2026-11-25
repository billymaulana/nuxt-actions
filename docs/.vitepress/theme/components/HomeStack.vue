<script setup lang="ts">
import { withBase } from 'vitepress'

const tools = [
  { name: 'Nuxt 3.7+ and 4', tone: 'accent' },
  { name: 'Nitro v2 and v3', tone: 'accent' },
  { name: 'Zod', tone: 'cyan' },
  { name: 'Valibot', tone: 'cyan' },
  { name: 'ArkType', tone: 'cyan' },
  { name: 'Standard Schema', tone: 'muted' },
]
</script>

<template>
  <section
    v-reveal
    class="home-block stack"
    aria-labelledby="stack-title"
  >
    <h2
      id="stack-title"
      class="stack-title"
    >
      Works with the tools you already use
    </h2>
    <ul class="stack-list">
      <li
        v-for="tool in tools"
        :key="tool.name"
        class="stack-pill"
      >
        <span
          class="stack-pill-dot"
          :class="`stack-pill-dot-${tool.tone}`"
          aria-hidden="true"
        />
        {{ tool.name }}
      </li>
    </ul>
    <p class="stack-note">
      Every release runs the same end-to-end suite on Nitro v2, Nitro v3, and a Nuxt 5 preview.
      <a :href="withBase('/guide/server-runtimes')">How the server runtime is chosen</a>
    </p>
  </section>
</template>
