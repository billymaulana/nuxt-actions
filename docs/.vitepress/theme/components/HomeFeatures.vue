<script setup lang="ts">
import { withBase } from 'vitepress'

interface Feature {
  name: string
  text: string
  link: string
}

interface FeatureGroup {
  title: string
  summary: string
  features: Feature[]
}

const groups: FeatureGroup[] = [
  {
    title: 'On the server',
    summary: 'One file per action, validated before your code runs.',
    features: [
      { name: 'defineAction', text: 'Validate input with Zod, Valibot, or ArkType and return typed data.', link: '/guide/define-action' },
      { name: 'Builder and middleware', text: 'Share auth, rate limits, and typed context across actions.', link: '/guide/builder-pattern' },
      { name: 'Streaming', text: 'Send chunks over Server-Sent Events and stop when the client leaves.', link: '/guide/streaming' },
      { name: 'File uploads', text: 'Multipart requests arrive as typed file fields.', link: '/guide/file-uploads' },
    ],
  },
  {
    title: 'In components',
    summary: 'Composables that know every action\'s input and output.',
    features: [
      { name: 'useAction', text: 'Status, data, and errors, with retries, deduplication, and cancel.', link: '/guide/use-action' },
      { name: 'SSR queries', text: 'Render on the server and refetch when the input changes.', link: '/guide/action-queries' },
      { name: 'Optimistic updates', text: 'Update the page at once and roll back if the server says no.', link: '/guide/optimistic-updates' },
      { name: 'Cache invalidation', text: 'A mutation refetches the queries it affects.', link: '/guide/cache-invalidation' },
    ],
  },
  {
    title: 'In production',
    summary: 'The parts you would otherwise build yourself.',
    features: [
      { name: 'Idempotency', text: 'Replay a duplicate request instead of running it twice.', link: '/guide/idempotency' },
      { name: 'Security', text: 'CSRF protection, rate limiting, and an auth preset.', link: '/guide/security' },
      { name: 'OpenAPI', text: 'An OpenAPI 3.1 document and Swagger UI, built from your actions.', link: '/guide/openapi' },
      { name: 'Nitro v2 and v3', text: 'The same actions run on both servers, tested on each release.', link: '/guide/server-runtimes' },
    ],
  },
]

function trackPointer(event: PointerEvent) {
  const card = event.currentTarget as HTMLElement
  const bounds = card.getBoundingClientRect()
  card.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`)
  card.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`)
}
</script>

<template>
  <section
    class="home-block"
    aria-labelledby="features-title"
  >
    <div
      v-reveal
      class="section-head"
    >
      <div class="eyebrow">
        <span class="eyebrow-pill">What is included</span>
      </div>
      <h2
        id="features-title"
        class="section-title"
      >
        Everything an action needs, from input to production
      </h2>
    </div>
    <div class="feature-cards">
      <article
        v-for="(group, index) in groups"
        :key="group.title"
        v-reveal="index * 110"
        class="feature-card"
        @pointermove="trackPointer"
      >
        <h3 class="feature-card-title">
          {{ group.title }}
        </h3>
        <p class="feature-card-summary">
          {{ group.summary }}
        </p>
        <ul class="feature-rows">
          <li
            v-for="feature in group.features"
            :key="feature.name"
          >
            <a
              class="feature-row"
              :href="withBase(feature.link)"
            >
              <span class="feature-row-name">{{ feature.name }}</span>
              <span class="feature-row-text">{{ feature.text }}</span>
            </a>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>
