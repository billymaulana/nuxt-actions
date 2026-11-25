<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEMO_ORIGIN, EXAMPLE_DIR, REPOSITORY } from '../../examples'

const props = withDefaults(defineProps<{
  page: string
  embed?: boolean
}>(), {
  embed: true,
})

const route = computed(() => props.page.replace(/^pages/, '').replace(/(\/index)?\.vue$/, '') || '/')
const githubUrl = computed(() => `https://github.com/${REPOSITORY}/blob/main/${EXAMPLE_DIR}/${props.page}`)
const demoUrl = computed(() => `${DEMO_ORIGIN}${route.value}`)
const running = ref(false)
</script>

<template>
  <div class="example-source">
    <div class="example-source-bar">
      <div class="example-source-file">
        <code class="example-source-path">{{ page }}</code>
        <span class="example-source-route">Runs at <code>{{ route }}</code> in the example app</span>
      </div>
      <div class="example-source-links">
        <button
          v-if="embed"
          type="button"
          class="example-source-link"
          :aria-expanded="running"
          @click="running = !running"
        >
          {{ running ? 'Hide demo' : 'Run here' }}
        </button>
        <a
          class="example-source-link"
          :href="demoUrl"
          target="_blank"
          rel="noreferrer"
        >
          Open live demo
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
          ><path d="M5 11 11 5M6 5h5v5" /></svg>
        </a>
        <a
          class="example-source-link"
          :href="githubUrl"
          target="_blank"
          rel="noreferrer"
        >
          View source
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
          ><path d="M5 11 11 5M6 5h5v5" /></svg>
        </a>
      </div>
    </div>
    <div
      v-if="embed && running"
      class="example-source-demo"
    >
      <iframe
        :src="demoUrl"
        :title="`Live demo of ${route}`"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
    <p
      v-if="!embed"
      class="example-source-note"
    >
      This demo sets a <code>SameSite=Strict</code> cookie, which browsers do not send to a page embedded from another site, so it opens in a new tab.
    </p>
  </div>
</template>
