<script setup lang="ts">
import { computed } from 'vue'
import { EXAMPLE_REPOSITORY } from '../../examples'

const props = defineProps<{
  page: string
}>()

const route = computed(() => props.page.replace(/^pages/, '').replace(/(\/index)?\.vue$/, '') || '/')
const githubUrl = computed(() => `https://github.com/${EXAMPLE_REPOSITORY}/blob/main/${props.page}`)
const stackblitzUrl = computed(() => `https://stackblitz.com/github/${EXAMPLE_REPOSITORY}?file=${props.page}`)
</script>

<template>
  <div class="example-source">
    <div class="example-source-file">
      <code class="example-source-path">{{ page }}</code>
      <span class="example-source-route">Runs at <code>{{ route }}</code> in the example app</span>
    </div>
    <div class="example-source-links">
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
      <a
        class="example-source-link"
        :href="stackblitzUrl"
        target="_blank"
        rel="noreferrer"
      >
        Open in StackBlitz
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
        ><path d="M5 11 11 5M6 5h5v5" /></svg>
      </a>
    </div>
  </div>
</template>
